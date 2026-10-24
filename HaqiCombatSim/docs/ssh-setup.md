# 游戏服 SSH 入口

用户约定（2026-10-24）：每台新电脑操作游戏服前，先配置并验证统一的 `haqi-us1` SSH 别名。已有可用配置先复用，不重复索要登录方式；不同电脑创建独立密钥，不复制私钥。

完整流程的唯一维护入口为独立 **HaqiGameServerLite** 仓库的 `docs/ssh-setup.md`。本机文件位于 `C:/lxzsrc/HaqiGameServerLite/docs/ssh-setup.md`；其他机器先定位该仓库，不假定相同 checkout 路径。

目标为 `root@43.130.151.173:22`（`us1.gameserver.keepwork.com`），先执行：

```sh
ssh -o BatchMode=yes -o ConnectTimeout=10 haqi-us1 "id -un"
```

当前 Windows Administrator 已配置 `~/.ssh/config` 和独立密钥 `~/.ssh/haqi_us1_ed25519`，验证通过。新电脑需按照服务器仓库文档建立同名连接；密码和私钥不得写入文档或仓库。
