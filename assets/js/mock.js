const mockUsers = [
  {
    account: "user01",
    password: "123456",
    name: "王工",
    hasPermission: true,
    offlineAllowed: true,
    disabled: false,
  },
  {
    account: "user02",
    password: "123456",
    name: "李工",
    hasPermission: false,
    offlineAllowed: false,
    disabled: false,
  },
  {
    account: "disabled01",
    password: "123456",
    name: "赵工",
    hasPermission: true,
    offlineAllowed: true,
    disabled: true,
  },
];

const mockDomainAccounts = ["user01", "GWM\\wang", "GWM\\li", "GWM\\tester"];

const permissionMap = {
  default: ["诊断工具", "总线监控", "日志管理", "数据版本"],
  limited: ["诊断工具", "日志管理"],
};

const delay = (payload, ms = 400) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(payload), ms);
  });

const resolveVersionStatus = (status) => {
  switch (status) {
    case "none":
      return { label: "无本地版本，已拉取最新", level: "warning" };
    case "same":
      return { label: "版本一致，无需更新", level: "success" };
    case "update":
      return { label: "版本不一致，已下载并替换", level: "warning" };
    case "fail":
      return { label: "版本更新失败，保留旧版本", level: "danger" };
    default:
      return { label: "待检测", level: "neutral" };
  }
};

const mockApi = {
  loginOnline({ account, password }) {
    if (!account) {
      return delay({ code: 400, message: "请填写账号" });
    }
    if (!password) {
      return delay({ code: 400, message: "请填写密码" });
    }
    const user = mockUsers.find((item) => item.account === account);
    if (!user) {
      return delay({ code: 404, message: "账号不存在", error: "ACCOUNT_NOT_FOUND" });
    }
    if (user.disabled) {
      return delay({ code: 403, message: "您的账户已被禁用！", error: "ACCOUNT_DISABLED" });
    }
    if (!user.hasPermission) {
      return delay({ code: 403, message: "无权限登录", error: "NO_PERMISSION" });
    }
    if (user.password !== password) {
      return delay({ code: 401, message: "账号或密码输入错误", error: "PASSWORD_MISMATCH" });
    }
    return delay({
      code: 0,
      message: "登录成功",
      data: {
        account: user.account,
        name: user.name,
        permissions: permissionMap.default,
        offlineAllowed: user.offlineAllowed,
      },
    });
  },
  loginDomain({ account }) {
    if (!account) {
      return delay({ code: 400, message: "请填写域账号" });
    }
    if (!mockDomainAccounts.includes(account)) {
      return delay({ code: 404, message: "您的账号不存在", error: "ACCOUNT_NOT_FOUND" });
    }
    return delay({
      code: 0,
      message: "域账号登录成功",
      data: {
        account,
        permissions: permissionMap.default,
        offlineAllowed: true,
      },
    });
  },
  loginOffline({ account, password, offlinePermission }) {
    if (!account) {
      return delay({ code: 400, message: "请填写账号" });
    }
    if (!password) {
      return delay({ code: 400, message: "请填写密码" });
    }
    const user = mockUsers.find((item) => item.account === account);
    if (!user) {
      return delay({ code: 404, message: "账号不存在", error: "ACCOUNT_NOT_FOUND" });
    }
    if (!offlinePermission || !user.offlineAllowed) {
      return delay({ code: 403, message: "无离线权限", error: "NO_OFFLINE_PERMISSION" });
    }
    if (user.password !== password) {
      return delay({ code: 401, message: "账号或密码输入错误", error: "PASSWORD_MISMATCH" });
    }
    return delay({
      code: 0,
      message: "离线登录成功",
      data: {
        account: user.account,
        name: user.name,
        permissions: permissionMap.limited,
        offlineAllowed: user.offlineAllowed,
      },
    });
  },
  fetchPermissions(account) {
    if (account === "user02") {
      return delay(permissionMap.limited);
    }
    return delay(permissionMap.default);
  },
  checkDataVersion({ status }) {
    const result = resolveVersionStatus(status);
    return delay({
      code: 0,
      data: result,
    });
  },
  getOfflinePermission({ account }) {
    if (!account) {
      return delay({ code: 400, data: false, message: "缺少账号" });
    }
    const user = mockUsers.find((item) => item.account === account);
    if (!user) {
      return delay({ code: 404, data: false, message: "账号不存在" });
    }
    return delay({ code: 0, data: Boolean(user.offlineAllowed) });
  },
};

window.mockApi = mockApi;
