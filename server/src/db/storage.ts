import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { MongoClient, type Collection, type Db, type Document } from 'mongodb';
import { logger } from '../utils/logger';

export interface UserDoc {
  _id: string;
  username: string;
  usernameNormalized: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  avatar: string;
  bio: string;
  status: 'online' | 'offline' | 'away';
  lastSeenAt: string;
  readReceiptsEnabled: boolean;
  soundEnabled: boolean;
  resetToken?: string;
  resetTokenExpiry?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDoc {
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  avatar?: string;
  createdBy: string;
  members: {
    userId: string;
    role: 'admin' | 'member';
    joinedAt: string;
    lastReadMessageId?: string;
    lastReadAt?: string;
    isMuted?: boolean;
  }[];
  lastMessage?: {
    id: string;
    senderId: string;
    senderUsername: string;
    text: string;
    type: 'text' | 'image' | 'file' | 'system';
    createdAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MessageDoc {
  _id: string;
  conversationId: string;
  senderId: string;
  clientMessageId?: string;
  type: 'text' | 'image' | 'file' | 'system';
  text: string;
  attachments?: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    thumbnailUrl?: string;
  }[];
  replyToId?: string;
  replyTo?: {
    id: string;
    senderUsername: string;
    text: string;
  };
  receipts: {
    userId: string;
    status: 'delivered' | 'read';
    updatedAt: string;
  }[];
  editedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentDoc {
  _id: string;
  uploaderId: string;
  storageKey?: string;
  originalName: string;
  safeName?: string;
  mimeType: string;
  size: number;
  hash?: string;
  dataUrl?: string; // Legacy fallback
  createdAt: string;
}

export interface DatabaseState {
  users: UserDoc[];
  conversations: ConversationDoc[];
  messages: MessageDoc[];
  attachments: AttachmentDoc[];
}

type MongoStoredDocument = Document & { _id: string };

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'chatsphere_db.json');

class DatabaseEngine {
  private state: DatabaseState = {
    users: [],
    conversations: [],
    messages: [],
    attachments: [],
  };
  private isLoaded = false;
  private saveTimeout: NodeJS.Timeout | null = null;
  private mongoClient: MongoClient | null = null;
  private mongoDatabase: Db | null = null;
  private mongoSaveQueue: Promise<void> = Promise.resolve();

  // High-performance In-Memory Indexes (Section 22)
  private userByIdIndex = new Map<string, UserDoc>();
  private userByUsernameIndex = new Map<string, UserDoc>();
  private userByEmailIndex = new Map<string, UserDoc>();
  private conversationByIdIndex = new Map<string, ConversationDoc>();
  private directConversationIndex = new Map<string, ConversationDoc>();
  private userConversationsIndex = new Map<string, Set<string>>();
  private messageByIdIndex = new Map<string, MessageDoc>();
  private clientMessageIdIndex = new Map<string, MessageDoc>();
  private conversationMessagesIndex = new Map<string, MessageDoc[]>();
  private attachmentByIdIndex = new Map<string, AttachmentDoc>();

  constructor() {
    this.init();
  }

  private init() {
    if (this.isLoaded) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.state = JSON.parse(raw);
        // Clean and deduplicate state defensively
        const cleanUsers = new Map<string, UserDoc>();
        for (const u of (this.state.users || [])) {
          if (!u._id.startsWith('bench_usr_') && !cleanUsers.has(u._id)) {
            cleanUsers.set(u._id, u);
          }
        }
        this.state.users = Array.from(cleanUsers.values());

        const cleanConvs = new Map<string, ConversationDoc>();
        for (const c of (this.state.conversations || [])) {
          if (c.createdBy !== 'bench_usr_1' && !cleanConvs.has(c._id)) {
            cleanConvs.set(c._id, c);
          }
        }
        this.state.conversations = Array.from(cleanConvs.values());

        const cleanMsgs = new Map<string, MessageDoc>();
        for (const m of (this.state.messages || [])) {
          if (!m._id.startsWith('bench_msg_') && !cleanMsgs.has(m._id)) {
            cleanMsgs.set(m._id, m);
          }
        }
        this.state.messages = Array.from(cleanMsgs.values());
        this.isLoaded = true;
      } else {
        this.seedInitialData();
        this.saveImmediately();
        this.isLoaded = true;
      }

      // Migrate any legacy dataUrl attachments out of database file to private object storage
      const storageDir = path.resolve(DATA_DIR, 'storage', 'attachments');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
      }

      let mutated = false;
      for (const att of this.state.attachments) {
        if (!att.storageKey) {
          att.storageKey = `migrated_${att._id}`;
        }
        if (att.dataUrl && att.dataUrl.startsWith('data:')) {
          const match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const buffer = Buffer.from(match[2], 'base64');
            const targetPath = path.join(storageDir, att.storageKey);
            if (!fs.existsSync(targetPath)) {
              fs.writeFileSync(targetPath, buffer, { mode: 0o600 });
            }
            delete att.dataUrl;
            mutated = true;
          }
        }
      }
      if (mutated) {
        this.saveImmediately();
      }
    } catch (err) {
      console.error('Failed to load database file, reinitializing fresh seed:', err);
      this.seedInitialData();
      this.saveImmediately();
      this.isLoaded = true;
    }
    this.rebuildIndexes();
  }

  public get isMongoConnected(): boolean {
    return this.mongoDatabase !== null;
  }

  public async connect(): Promise<void> {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      logger.info('MONGO_URI is not configured; using local JSON storage');
      return;
    }
    if (this.mongoDatabase) return;

    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });
    try {
      await client.connect();
      const database = client.db();
      const collections = {
        users: database.collection<MongoStoredDocument>('users'),
        conversations: database.collection<MongoStoredDocument>('conversations'),
        messages: database.collection<MongoStoredDocument>('messages'),
        attachments: database.collection<MongoStoredDocument>('attachments'),
      };

      await Promise.all([
        collections.users.createIndex({ emailNormalized: 1 }, { unique: true }),
        collections.users.createIndex({ usernameNormalized: 1 }, { unique: true }),
        collections.conversations.createIndex({ 'members.userId': 1 }),
        collections.messages.createIndex({ conversationId: 1, createdAt: 1 }),
        collections.messages.createIndex(
          { conversationId: 1, clientMessageId: 1 },
          {
            unique: true,
            partialFilterExpression: { clientMessageId: { $type: 'string' } },
          },
        ),
      ]);

      const collectionValues = Object.values(collections);
      const hasExistingMongoData = (await Promise.all(
        collectionValues.map(collection => collection.countDocuments({}, { limit: 1 })),
      )).some(count => count > 0);

      this.mongoClient = client;
      this.mongoDatabase = database;

      if (hasExistingMongoData) {
        this.state = {
          users: await this.readCollection<UserDoc>(collections.users),
          conversations: await this.readCollection<ConversationDoc>(collections.conversations),
          messages: await this.readCollection<MessageDoc>(collections.messages),
          attachments: await this.readCollection<AttachmentDoc>(collections.attachments),
        };
        logger.info('Loaded ChatSphere data from MongoDB', {
          users: this.state.users.length,
          conversations: this.state.conversations.length,
          messages: this.state.messages.length,
          attachments: this.state.attachments.length,
        });
      } else {
        await this.persistMongoState(this.getPersistableState());
        logger.info('MongoDB is empty; imported existing ChatSphere data', {
          users: this.state.users.length,
          conversations: this.state.conversations.length,
          messages: this.state.messages.length,
          attachments: this.state.attachments.length,
        });
      }

      this.rebuildIndexes();
      logger.info('Connected to MongoDB', { database: database.databaseName });
    } catch (error) {
      try {
        await client.close();
      } catch (closeError) {
        logger.error('Failed to close MongoDB client after startup error', closeError);
      }
      throw new Error('Could not connect to or initialize MongoDB. Check MONGO_URI, network access, and database credentials.', { cause: error });
    }
  }

  private async readCollection<T>(collection: Collection<MongoStoredDocument>): Promise<T[]> {
    return await collection.find({}).toArray() as T[];
  }

  public getDirectKey(u1: string, u2: string): string {
    return [u1, u2].sort().join(':');
  }

  public rebuildIndexes() {
    this.userByIdIndex.clear();
    this.userByUsernameIndex.clear();
    this.userByEmailIndex.clear();
    for (const u of this.state.users) {
      this.userByIdIndex.set(u._id, u);
      this.userByUsernameIndex.set(u.usernameNormalized, u);
      this.userByEmailIndex.set(u.emailNormalized, u);
    }

    this.conversationByIdIndex.clear();
    this.directConversationIndex.clear();
    this.userConversationsIndex.clear();
    for (const c of this.state.conversations) {
      this.conversationByIdIndex.set(c._id, c);
      if (c.type === 'direct' && c.members.length === 2) {
        const key = this.getDirectKey(c.members[0].userId, c.members[1].userId);
        this.directConversationIndex.set(key, c);
      }
      for (const m of c.members) {
        let set = this.userConversationsIndex.get(m.userId);
        if (!set) {
          set = new Set();
          this.userConversationsIndex.set(m.userId, set);
        }
        set.add(c._id);
      }
    }

    this.messageByIdIndex.clear();
    this.clientMessageIdIndex.clear();
    this.conversationMessagesIndex.clear();
    for (const m of this.state.messages) {
      this.messageByIdIndex.set(m._id, m);
      if (m.clientMessageId) {
        this.clientMessageIdIndex.set(`${m.conversationId}:${m.clientMessageId}`, m);
      }
      let list = this.conversationMessagesIndex.get(m.conversationId);
      if (!list) {
        list = [];
        this.conversationMessagesIndex.set(m.conversationId, list);
      }
      list.push(m);
    }

    // Ensure sorted chronologically
    for (const list of this.conversationMessagesIndex.values()) {
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    this.attachmentByIdIndex.clear();
    for (const a of this.state.attachments) {
      this.attachmentByIdIndex.set(a._id, a);
    }
  }

  public getAttachmentById(id: string): AttachmentDoc | undefined {
    this.init();
    return this.attachmentByIdIndex.get(id);
  }

  public addAttachmentToIndex(att: AttachmentDoc) {
    this.attachmentByIdIndex.set(att._id, att);
  }

  public getUserById(id: string): UserDoc | undefined {
    this.init();
    return this.userByIdIndex.get(id);
  }

  public getUserByUsername(usernameNormalized: string): UserDoc | undefined {
    this.init();
    return this.userByUsernameIndex.get(usernameNormalized);
  }

  public getUserByEmail(emailNormalized: string): UserDoc | undefined {
    this.init();
    return this.userByEmailIndex.get(emailNormalized);
  }

  public getConversationById(id: string): ConversationDoc | undefined {
    this.init();
    return this.conversationByIdIndex.get(id);
  }

  public getDirectConversation(u1: string, u2: string): ConversationDoc | undefined {
    this.init();
    return this.directConversationIndex.get(this.getDirectKey(u1, u2));
  }

  public getConversationsForUser(userId: string): ConversationDoc[] {
    this.init();
    const convIds = this.userConversationsIndex.get(userId);
    if (!convIds) return [];
    const res: ConversationDoc[] = [];
    for (const id of convIds) {
      const conv = this.conversationByIdIndex.get(id);
      if (conv) res.push(conv);
    }
    return res;
  }

  public getMessageById(id: string): MessageDoc | undefined {
    this.init();
    return this.messageByIdIndex.get(id);
  }

  public getMessageByClientMessageId(conversationId: string, clientMessageId: string): MessageDoc | undefined {
    this.init();
    return this.clientMessageIdIndex.get(`${conversationId}:${clientMessageId}`);
  }

  public getMessagesForConversation(conversationId: string): MessageDoc[] {
    this.init();
    return this.conversationMessagesIndex.get(conversationId) || [];
  }

  public addMessageToIndex(msg: MessageDoc) {
    this.messageByIdIndex.set(msg._id, msg);
    if (msg.clientMessageId) {
      this.clientMessageIdIndex.set(`${msg.conversationId}:${msg.clientMessageId}`, msg);
    }
    let list = this.conversationMessagesIndex.get(msg.conversationId);
    if (!list) {
      list = [];
      this.conversationMessagesIndex.set(msg.conversationId, list);
    }
    list.push(msg);
  }

  public addUserToIndex(user: UserDoc) {
    this.userByIdIndex.set(user._id, user);
    this.userByUsernameIndex.set(user.usernameNormalized, user);
    this.userByEmailIndex.set(user.emailNormalized, user);
  }

  public addConversationToIndex(conv: ConversationDoc) {
    this.conversationByIdIndex.set(conv._id, conv);
    if (conv.type === 'direct' && conv.members.length === 2) {
      const key = this.getDirectKey(conv.members[0].userId, conv.members[1].userId);
      this.directConversationIndex.set(key, conv);
    }
    for (const m of conv.members) {
      let set = this.userConversationsIndex.get(m.userId);
      if (!set) {
        set = new Set();
        this.userConversationsIndex.set(m.userId, set);
      }
      set.add(conv._id);
    }
  }

  private saveImmediately() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const stateToSave = this.getPersistableState();
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(stateToSave, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Error saving database atomically:', err);
    }
  }

  private getPersistableState(): DatabaseState {
    return {
      users: Array.from(new Map(
        this.state.users
          .filter(user => !user._id.startsWith('bench_usr_'))
          .map(user => [user._id, user]),
      ).values()),
      conversations: Array.from(new Map(
        this.state.conversations
          .filter(conversation => conversation.createdBy !== 'bench_usr_1')
          .map(conversation => [conversation._id, conversation]),
      ).values()),
      messages: Array.from(new Map(
        this.state.messages
          .filter(message => !message._id.startsWith('bench_msg_'))
          .map(message => [message._id, message]),
      ).values()),
      attachments: this.state.attachments,
    };
  }

  private async replaceCollection(
    collection: Collection<MongoStoredDocument>,
    documents: Array<{ _id: string }>,
  ): Promise<void> {
    if (documents.length > 0) {
      await collection.bulkWrite(documents.map(document => ({
        replaceOne: {
          filter: { _id: document._id },
          replacement: document as MongoStoredDocument,
          upsert: true,
        },
      })));
      await collection.deleteMany({ _id: { $nin: documents.map(document => document._id) } });
    } else {
      await collection.deleteMany({});
    }
  }

  private async persistMongoState(state: DatabaseState): Promise<void> {
    if (!this.mongoDatabase) {
      throw new Error('MongoDB is not connected');
    }

    await Promise.all([
      this.replaceCollection(this.mongoDatabase.collection<MongoStoredDocument>('users'), state.users),
      this.replaceCollection(this.mongoDatabase.collection<MongoStoredDocument>('conversations'), state.conversations),
      this.replaceCollection(this.mongoDatabase.collection<MongoStoredDocument>('messages'), state.messages),
      this.replaceCollection(this.mongoDatabase.collection<MongoStoredDocument>('attachments'), state.attachments),
    ]);
  }

  private queueMongoSave(): void {
    const snapshot = JSON.parse(JSON.stringify(this.getPersistableState())) as DatabaseState;
    this.mongoSaveQueue = this.mongoSaveQueue
      .then(() => this.persistMongoState(snapshot))
      .catch(error => {
        logger.error('Failed to persist ChatSphere data to MongoDB', error);
      });
  }

  public scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      if (this.mongoDatabase) {
        this.queueMongoSave();
      } else {
        this.saveImmediately();
      }
      this.saveTimeout = null;
    }, 200);
  }

  public async close(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
      if (this.mongoDatabase) {
        this.queueMongoSave();
      } else {
        this.saveImmediately();
      }
    }
    await this.mongoSaveQueue;
    await this.mongoClient?.close();
    this.mongoClient = null;
    this.mongoDatabase = null;
  }

  private seedInitialData() {
    const salt = bcrypt.genSaltSync(10);
    const defaultPasswordHash = bcrypt.hashSync('password123', salt);

    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const oneMinAgo = new Date(now.getTime() - 60 * 1000).toISOString();

    const u1: UserDoc = {
      _id: 'usr_alex',
      username: 'alex_rivera',
      usernameNormalized: 'alex_rivera',
      email: 'alex@chatsphere.io',
      emailNormalized: 'alex@chatsphere.io',
      passwordHash: defaultPasswordHash,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex&backgroundColor=6366f1',
      bio: 'Principal Architect @ ChatSphere. Focusing on distributed consensus & real-time protocols.',
      status: 'online',
      lastSeenAt: new Date().toISOString(),
      readReceiptsEnabled: true,
      soundEnabled: true,
      createdAt: new Date(now.getTime() - 86400000 * 30).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const u2: UserDoc = {
      _id: 'usr_sam',
      username: 'sam_chen',
      usernameNormalized: 'sam_chen',
      email: 'sam@chatsphere.io',
      passwordHash: defaultPasswordHash,
      emailNormalized: 'sam@chatsphere.io',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sam&backgroundColor=06b6d4',
      bio: 'Staff Product Designer. Typography, micro-interactions, dark mode enthusiast.',
      status: 'online',
      lastSeenAt: new Date().toISOString(),
      readReceiptsEnabled: true,
      soundEnabled: true,
      createdAt: new Date(now.getTime() - 86400000 * 25).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const u3: UserDoc = {
      _id: 'usr_elena',
      username: 'elena_rostova',
      usernameNormalized: 'elena_rostova',
      email: 'elena@chatsphere.io',
      emailNormalized: 'elena@chatsphere.io',
      passwordHash: defaultPasswordHash,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=elena&backgroundColor=10b981',
      bio: 'Engineering Lead, Core Infrastructure. Latency hunter.',
      status: 'away',
      lastSeenAt: tenMinAgo,
      readReceiptsEnabled: true,
      soundEnabled: true,
      createdAt: new Date(now.getTime() - 86400000 * 20).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const u4: UserDoc = {
      _id: 'usr_marcus',
      username: 'marcus_vance',
      usernameNormalized: 'marcus_vance',
      email: 'marcus@chatsphere.io',
      emailNormalized: 'marcus@chatsphere.io',
      passwordHash: defaultPasswordHash,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=marcus&backgroundColor=f59e0b',
      bio: 'VP of Product. Shipping high-signal tools for modern teams.',
      status: 'offline',
      lastSeenAt: tenMinAgo,
      readReceiptsEnabled: true,
      soundEnabled: true,
      createdAt: new Date(now.getTime() - 86400000 * 15).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Direct Conversation between Alex and Sam
    const cDirect: ConversationDoc = {
      _id: 'conv_alex_sam',
      type: 'direct',
      createdBy: u1._id,
      members: [
        { userId: u1._id, role: 'member', joinedAt: tenMinAgo },
        { userId: u2._id, role: 'member', joinedAt: tenMinAgo },
      ],
      lastMessage: {
        id: 'msg_dm_3',
        senderId: u2._id,
        senderUsername: u2.username,
        text: 'The sub-200ms socket latency feels instantaneous. Great work on the event loop!',
        type: 'text',
        createdAt: oneMinAgo,
      },
      createdAt: tenMinAgo,
      updatedAt: oneMinAgo,
    };

    // Group Conversation: Engineering Core
    const cGroup: ConversationDoc = {
      _id: 'conv_eng_core',
      type: 'group',
      name: 'Engineering Core',
      description: 'Distributed systems, database tuning, real-time message pipelines.',
      avatar: '',
      createdBy: u1._id,
      members: [
        { userId: u1._id, role: 'admin', joinedAt: tenMinAgo },
        { userId: u2._id, role: 'member', joinedAt: tenMinAgo },
        { userId: u3._id, role: 'member', joinedAt: tenMinAgo },
        { userId: u4._id, role: 'member', joinedAt: tenMinAgo },
      ],
      lastMessage: {
        id: 'msg_grp_2',
        senderId: u1._id,
        senderUsername: u1.username,
        text: 'Production release checklist is approved. Real-time presence and delivery receipts are fully functional.',
        type: 'text',
        createdAt: fiveMinAgo,
      },
      createdAt: tenMinAgo,
      updatedAt: fiveMinAgo,
    };

    const messages: MessageDoc[] = [
      {
        _id: 'msg_dm_1',
        conversationId: cDirect._id,
        senderId: u1._id,
        type: 'text',
        text: 'Hey Sam, have you reviewed the new cursor pagination spec for message history?',
        receipts: [
          { userId: u2._id, status: 'read', updatedAt: tenMinAgo },
        ],
        createdAt: tenMinAgo,
        updatedAt: tenMinAgo,
      },
      {
        _id: 'msg_dm_2',
        conversationId: cDirect._id,
        senderId: u2._id,
        type: 'text',
        text: 'Yes! The timestamp + ID compound index guarantees zero duplicate or skipped messages when scrolling up.',
        receipts: [
          { userId: u1._id, status: 'read', updatedAt: fiveMinAgo },
        ],
        replyToId: 'msg_dm_1',
        replyTo: {
          id: 'msg_dm_1',
          senderUsername: u1.username,
          text: 'Hey Sam, have you reviewed the new cursor pagination spec for message history?',
        },
        createdAt: fiveMinAgo,
        updatedAt: fiveMinAgo,
      },
      {
        _id: 'msg_dm_3',
        conversationId: cDirect._id,
        senderId: u2._id,
        type: 'text',
        text: 'The sub-200ms socket latency feels instantaneous. Great work on the event loop!',
        receipts: [
          { userId: u1._id, status: 'delivered', updatedAt: oneMinAgo },
        ],
        createdAt: oneMinAgo,
        updatedAt: oneMinAgo,
      },
      {
        _id: 'msg_grp_1',
        conversationId: cGroup._id,
        senderId: u3._id,
        type: 'text',
        text: 'Deployment pipeline completed without warnings. Ready for end-to-end multi-device testing.',
        receipts: [
          { userId: u1._id, status: 'read', updatedAt: tenMinAgo },
          { userId: u2._id, status: 'read', updatedAt: tenMinAgo },
        ],
        createdAt: tenMinAgo,
        updatedAt: tenMinAgo,
      },
      {
        _id: 'msg_grp_2',
        conversationId: cGroup._id,
        senderId: u1._id,
        type: 'text',
        text: 'Production release checklist is approved. Real-time presence and delivery receipts are fully functional.',
        receipts: [
          { userId: u2._id, status: 'read', updatedAt: fiveMinAgo },
          { userId: u3._id, status: 'read', updatedAt: fiveMinAgo },
          { userId: u4._id, status: 'delivered', updatedAt: fiveMinAgo },
        ],
        createdAt: fiveMinAgo,
        updatedAt: fiveMinAgo,
      },
    ];

    this.state = {
      users: [u1, u2, u3, u4],
      conversations: [cDirect, cGroup],
      messages,
      attachments: [],
    };
  }

  // Collections accessors
  public get users() {
    this.init();
    return this.state.users;
  }
  public set users(val: UserDoc[]) {
    this.init();
    this.state.users = val;
  }

  public get conversations() {
    this.init();
    return this.state.conversations;
  }
  public set conversations(val: ConversationDoc[]) {
    this.init();
    this.state.conversations = val;
  }

  public get messages() {
    this.init();
    return this.state.messages;
  }
  public set messages(val: MessageDoc[]) {
    this.init();
    this.state.messages = val;
  }

  public get attachments() {
    this.init();
    return this.state.attachments;
  }
  public set attachments(val: AttachmentDoc[]) {
    this.init();
    this.state.attachments = val;
  }
}

export const db = new DatabaseEngine();
