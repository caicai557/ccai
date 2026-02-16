import Database from 'better-sqlite3';
import { AccountDao } from './AccountDao';
import { TargetDao } from './TargetDao';
import { TemplateDao } from './TemplateDao';
import { RateLimitDao } from './RateLimitDao';
import { MessageHistoryDao } from './MessageHistoryDao';
import { LogDao } from './LogDao';
import { ConfigDao } from './ConfigDao';
import { DiscoveryCandidateDao } from './DiscoveryCandidateDao';

/**
 * DAO工厂类
 */
export class DaoFactory {
  private static instance: DaoFactory;
  private db: Database.Database;

  private accountDao?: AccountDao;
  private targetDao?: TargetDao;
  private templateDao?: TemplateDao;
  private rateLimitDao?: RateLimitDao;
  private messageHistoryDao?: MessageHistoryDao;
  private logDao?: LogDao;
  private configDao?: ConfigDao;
  private discoveryCandidateDao?: DiscoveryCandidateDao;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static initialize(db: Database.Database): DaoFactory {
    if (!DaoFactory.instance || DaoFactory.instance.db !== db) {
      DaoFactory.instance = new DaoFactory(db);
    }
    return DaoFactory.instance;
  }

  static getInstance(): DaoFactory {
    if (!DaoFactory.instance) {
      throw new Error('DaoFactory未初始化，请先调用initialize()');
    }
    return DaoFactory.instance;
  }

  getAccountDao(): AccountDao {
    if (!this.accountDao) {
      this.accountDao = new AccountDao(this.db);
    }
    return this.accountDao;
  }

  getTargetDao(): TargetDao {
    if (!this.targetDao) {
      this.targetDao = new TargetDao(this.db);
    }
    return this.targetDao;
  }

  getTemplateDao(): TemplateDao {
    if (!this.templateDao) {
      this.templateDao = new TemplateDao(this.db);
    }
    return this.templateDao;
  }

  getRateLimitDao(): RateLimitDao {
    if (!this.rateLimitDao) {
      this.rateLimitDao = new RateLimitDao(this.db);
    }
    return this.rateLimitDao;
  }

  getMessageHistoryDao(): MessageHistoryDao {
    if (!this.messageHistoryDao) {
      this.messageHistoryDao = new MessageHistoryDao(this.db);
    }
    return this.messageHistoryDao;
  }

  getLogDao(): LogDao {
    if (!this.logDao) {
      this.logDao = new LogDao(this.db);
    }
    return this.logDao;
  }

  getConfigDao(): ConfigDao {
    if (!this.configDao) {
      this.configDao = new ConfigDao(this.db);
    }
    return this.configDao;
  }

  getDiscoveryCandidateDao(): DiscoveryCandidateDao {
    if (!this.discoveryCandidateDao) {
      this.discoveryCandidateDao = new DiscoveryCandidateDao(this.db);
    }
    return this.discoveryCandidateDao;
  }
}

export {
  AccountDao,
  TargetDao,
  TemplateDao,
  RateLimitDao,
  MessageHistoryDao,
  LogDao,
  ConfigDao,
  DiscoveryCandidateDao,
};
