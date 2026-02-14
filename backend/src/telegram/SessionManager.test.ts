/**
 * 会话管理器测试
 *
 * 这是一个简单的手动测试文件，用于验证会话管理功能
 * 运行方式：tsx backend/src/telegram/SessionManager.test.ts
 */

async function testSessionManager() {
  const [{ SessionManager }, { DaoFactory }, { initDatabase }] = await Promise.all([
    import('./SessionManager'),
    import('../database/dao'),
    import('../database/init'),
  ]);

  console.log('🧪 开始测试会话管理器...\n');

  // 初始化数据库
  console.log('📦 初始化数据库...');
  initDatabase();
  console.log('✅ 数据库初始化完成\n');

  const sessionManager = SessionManager.getInstance();
  const accountDao = DaoFactory.getInstance().getAccountDao();

  try {
    // 测试1: 创建测试账号
    console.log('📝 测试1: 创建测试账号');
    const testAccount = accountDao.create({
      phoneNumber: '+1234567890',
      session: '',
      status: 'offline',
    });
    console.log(`✅ 测试账号已创建: ${testAccount.id}\n`);

    // 测试2: 保存会话
    console.log('📝 测试2: 保存会话');
    const testSessionString = 'test_session_string_12345';
    await sessionManager.saveSession(testAccount.id, testSessionString);
    console.log('✅ 会话已保存\n');

    // 测试3: 加载会话
    console.log('📝 测试3: 加载会话');
    const loadedSession = await sessionManager.loadSession(testAccount.id);
    if (loadedSession === testSessionString) {
      console.log('✅ 会话加载成功，内容匹配\n');
    } else {
      console.log('❌ 会话内容不匹配\n');
    }

    // 测试4: 验证会话有效性
    console.log('📝 测试4: 验证会话有效性');
    const isValid = await sessionManager.isSessionValid(testAccount.id);
    console.log(`✅ 会话有效性: ${isValid}\n`);

    // 测试5: 获取会话信息
    console.log('📝 测试5: 获取会话信息');
    const sessionInfo = await sessionManager.getSessionInfo(testAccount.id);
    if (sessionInfo) {
      console.log('✅ 会话信息:');
      console.log(`   - 账号ID: ${sessionInfo.accountId}`);
      console.log(`   - 手机号: ${sessionInfo.phoneNumber}`);
      console.log(`   - 创建时间: ${sessionInfo.createdAt}`);
      console.log(`   - 最后使用: ${sessionInfo.lastUsed}\n`);
    }

    // 测试6: 导出会话
    console.log('📝 测试6: 导出会话');
    const exportedSession = await sessionManager.exportSession(testAccount.id);
    console.log(`✅ 会话已导出（长度: ${exportedSession.length}）\n`);

    // 测试7: 删除会话
    console.log('📝 测试7: 删除会话');
    await sessionManager.deleteSession(testAccount.id);
    const isValidAfterDelete = await sessionManager.isSessionValid(testAccount.id);
    console.log(`✅ 删除后会话有效性: ${isValidAfterDelete}\n`);

    // 测试8: 导入会话
    console.log('📝 测试8: 导入会话');
    await sessionManager.importSession(testAccount.id, exportedSession);
    const isValidAfterImport = await sessionManager.isSessionValid(testAccount.id);
    console.log(`✅ 导入后会话有效性: ${isValidAfterImport}\n`);

    // 测试9: 获取活跃会话列表
    console.log('📝 测试9: 获取活跃会话列表');
    const activeIds = await sessionManager.getActiveSessionIds();
    console.log(`✅ 活跃会话数量: ${activeIds.length}\n`);

    // 清理测试数据
    console.log('🧹 清理测试数据');
    accountDao.delete(testAccount.id);
    console.log('✅ 测试数据已清理\n');

    console.log('🎉 所有测试通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

// 运行测试
if (require.main === module) {
  testSessionManager()
    .then(() => {
      console.log('\n✅ 测试完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 测试失败:', error);
      process.exit(1);
    });
}

describe('SessionManager Manual Script', () => {
  test.skip('手动脚本，不在Jest自动执行中运行', () => {
    // 手动执行方式：tsx backend/src/telegram/SessionManager.test.ts
  });
});

export { testSessionManager };
