import { db, UserDoc } from '../db/storage';

export class UserRepository {
  async findById(id: string): Promise<UserDoc | null> {
    const user = db.getUserById(id);
    return user ? { ...user } : null;
  }

  async findByEmail(email: string): Promise<UserDoc | null> {
    const normalized = email.toLowerCase().trim();
    const user = db.getUserByEmail(normalized);
    return user ? { ...user } : null;
  }

  async findByUsername(username: string): Promise<UserDoc | null> {
    const normalized = username.toLowerCase().trim();
    const user = db.getUserByUsername(normalized);
    return user ? { ...user } : null;
  }

  async searchUsers(query: string, excludeUserId: string): Promise<UserDoc[]> {
    const q = query.toLowerCase().trim();
    const seen = new Set<string>();
    const results: UserDoc[] = [];
    for (const u of db.users) {
      if (u._id === excludeUserId || seen.has(u._id) || u._id.startsWith('bench_usr_')) continue;
      if (
        !q ||
        u.usernameNormalized.includes(q) ||
        u.emailNormalized.includes(q) ||
        u.bio.toLowerCase().includes(q)
      ) {
        seen.add(u._id);
        results.push({ ...u });
      }
    }
    return results;
  }

  async listUsers(excludeUserId: string): Promise<UserDoc[]> {
    const seen = new Set<string>();
    const results: UserDoc[] = [];
    for (const u of db.users) {
      if (u._id === excludeUserId || seen.has(u._id) || u._id.startsWith('bench_usr_')) continue;
      seen.add(u._id);
      results.push({ ...u });
    }
    return results;
  }

  async create(data: Omit<UserDoc, '_id' | 'createdAt' | 'updatedAt'>): Promise<UserDoc> {
    const now = new Date().toISOString();
    const newUser: UserDoc = {
      ...data,
      _id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(newUser);
    db.addUserToIndex(newUser);
    db.scheduleSave();
    return { ...newUser };
  }

  async update(id: string, updates: Partial<UserDoc>): Promise<UserDoc | null> {
    const index = db.users.findIndex(u => u._id === id);
    if (index === -1) return null;

    db.users[index] = {
      ...db.users[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    db.addUserToIndex(db.users[index]);
    db.scheduleSave();
    return { ...db.users[index] };
  }

  async updatePresence(id: string, status: 'online' | 'offline' | 'away'): Promise<void> {
    const user = db.users.find(u => u._id === id);
    if (user) {
      user.status = status;
      user.lastSeenAt = new Date().toISOString();
      user.updatedAt = new Date().toISOString();
      db.scheduleSave();
    }
  }
}

export const userRepository = new UserRepository();
