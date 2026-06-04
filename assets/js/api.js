const useMock = true;

const notImplemented = (name) =>
  Promise.resolve({
    code: -1,
    message: `${name} 暂未接入真实接口`,
  });

const realApi = {
  loginOnline: (payload) => notImplemented("在线登录"),
  loginDomain: (payload) => notImplemented("域账号登录"),
  loginOffline: (payload) => notImplemented("离线登录"),
  fetchPermissions: (payload) => notImplemented("权限获取"),
  checkDataVersion: (payload) => notImplemented("数据版本检测"),
  getOfflinePermission: (payload) => notImplemented("离线权限判断"),
};

const api = useMock && window.mockApi ? window.mockApi : realApi;

window.useMock = useMock;
window.api = api;
