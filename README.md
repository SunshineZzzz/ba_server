# Ba_Server

**Ba_Server**是一个以**Node.js**编写的原始日志落库分析系统
* 采用Master-Worker模式
* 支持单个日志落库，多个日志协同落库
* 支持日志发送端与baserver内部消息逻辑

## 文档

* [配置说明](#配置说明)
* [日志发送格式](#日志发送格式)
* [原始日志格式](#原始日志格式)
* [xml文件格式](#xml文件格式)
* [启动](#启动)

### 配置说明

开发环境对应的配置文件`app/config/default.json`
生产环境对应的配置文件`app/config/production.json`

**特别注意：**工程的根目录请使用`${APP_PATH}`

* `app.tcpHost` - tcp的对外地址 
* `app.tcpPort` - tcp的对外端口
* `app.workerNum` - 启动worker的个数，0表示按照cpu的个数启动
* `app.logXmlFile` - 原始日志xml文件
* `app.nMaxRestart` - worker重启次数，0表示重启没有限制
* `app.waitTime` - 内部请求超时，毫秒
* `app.logSeparator` - 原始日志分隔符
* `mysql.log` - mysql执行日志是否开启
* `mysql.basvr.host` - mysql服务的对外地址
* `mysql.basvr.port` - mysql服务的对外端口
* `mysql.basvr.user` - mysql服务的用户
* `mysql.basvr.password` - mysql服务的密码
* `mysql.basvr.database` - mysql服务的数据库
* `connectionLimit` - mysql服务的连接池大小
* `hb.mSendInterval` - master进程发送心跳的时间间隔
* `hb.wCheckInterval` - worker检查master心跳间隔
* `hb.wTimeout` - worker与master心跳超时时间
* `logger.path` - 日志路径
* `logger.name` - 日志名称，name.yyyyMMdd[hh].xxx
* `logger.level` - 日志等级
* `logger.host` - 日志对外地址
* `logger.port` - 日志对外端口

#### 例如

```json
{
	"app": {
		"tcpHost": "127.0.0.1",
		"tcpPort": 19999,
		"workerNum": 2,
		"logXmlFile": "${APP_PATH}/app/config/log.xml",
		"nMaxRestart": 10,
		"waitTime": 5000,
		"logSeparator": ","
	},
	"mysql": {
		"log": true,
		"basvr": {
			"host": "127.0.0.1",
			"port": 3306,
			"user": "root",
			"password": "123456",
			"database": "basvr",
			"connectionLimit": 10
		}
	},
	"hb": {
		"mSendInterval": 10000,
		"wCheckInterval": 10000,
		"wTimeout":120000
	},
	"logger": {
		"path": "${APP_PATH}/log/",
		"name": "default.log",
		"level": "ALL",
		"host": "127.0.0.1",
		"port": 5555
	}
}
```

### 日志发送格式

* 消息内容为**JSON**格式
* 无符号16个字节为协议命令，具体请看`app/config/STSCmd.js`，后面为消息内容
* 日志发送端连接成功后，第一次需要发送**ID**，以便**basvr**区分

#### 例如

**这里以Node.js和C++伪代码实例，其他语言类似**
**具体可以看`app/client.js`**

```javascript
// 打包数据
netPacket.packData = function (dataCmd, jsonData) {
  let jsonStr = JSON.stringify(jsonData);

  let dataSizeBuf = Buffer.alloc(this.packet.dataSize.size);
  let dataCmdBuf = Buffer.alloc(this.packet.dataCmd.size);
  let dataBuf = Buffer.from(jsonStr);
  dataSizeBuf.writeUInt32LE(dataBuf.length + this.packet.dataCmd.size);
  dataCmdBuf.writeUInt16LE(dataCmd);
  let buf = Buffer.concat([dataSizeBuf, dataCmdBuf, dataBuf]);
  dataSizeBuf = null;
  dataCmdBuf = null;
  dataBuf = null;

  return buf;
};

// 连接成功发送ID
client.connect(port, host, function() {
  console.log('game socket connect to %s:%s', host, port);
  client.write(netPacket.packData(STSCmd.eSTS_INNERBA_HELLO, {
    grpId: 1001
  }));
});

// 发送日志
setInterval(()=>{
  for (var [id, log] of rawLog) {
    client.write(netPacket.packData(STSCmd.eSTS_INNERBA_DATA, {
      logId: id,
      logMsg: log
    }));
  }
}, 1000);

// 内部消息
function testInnerMsg() {
  client.write(netPacket.packData(STSCmd.eSTS_INNERBA_INNER, {
    head: {
      grpId: 1001,
      cmdId: 1,
    },
    body: {
      msg: 'have a test for inner cmd'
    }
  }));
};
```

```c++
// 发送数据结构
#pragma pack(push, old_pack_num, 1)
	struct DATAPACKET_INNERBA_T
	{
		uint16_t nCmd;
		char data[1];
	};
#pragma pack(pop, old_pack_num)

// 发送ID
void SendHello()
{
	rapidjson::Document json(rapidjson::kObjectType);
	json.AddMember("grpId", nZoneId, json.GetAllocator());

	rapidjson::StringBuffer buffer;
	rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
	json.Accept(writer);
	const char* szjson = buffer.GetString();

	arrayBaBuffer.resize(sizeof(DATAPACKET_INNERBA_T) - sizeof(char) + strlen(szjson));
	DATAPACKET_INNERBA_T* pSendData = (DATAPACKET_INNERBA_T*)arrayBaBuffer.getbuf();
	pSendData->nCmd = eSTS_INNERBA_HELLO;
	memcpy(pSendData->data, szjson, strlen(szjson));

	sendmsg(arrayBaBuffer.getbuf(), arrayBaBuffer.getsize());
}

// 发送原始日志
void SendLogData()
{
	rapidjson::Document json(rapidjson::kObjectType);
	json.AddMember("logId", logId, json.GetAllocator());
	json.AddMember("logMsg", rapidjson::StringRef(pData, nLen), json.GetAllocator());

	rapidjson::StringBuffer buffer;
	rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
	json.Accept(writer);
	const char* szjson = buffer.GetString();

	arrayBaBuffer.resize(sizeof(DATAPACKET_INNERBA_T) - sizeof(char) + strlen(szjson));
	DATAPACKET_INNERBA_T* pSendData = (DATAPACKET_INNERBA_T*)arrayBaBuffer.getbuf();
	pSendData->nCmd = eSTS_INNERBA_DATA;
	memcpy(pSendData->data, szjson, strlen(szjson));

	sendmsg(arrayBaBuffer.getbuf(), arrayBaBuffer.getsize());
}
```

### 原始日志格式

* 指定符号分隔
* 前四个项目格式为：
进程信息(或者其他) **分隔符** 时间(或者其他) **分隔符** 日志ID **分隔符** 日志关键字 **分隔符** 其他以**分隔符**分隔的日志

#### 例如

```text
Misc1.6764,22-16:59:36,1001,PlayerLogin,1001,1590369878,2219000000000000002,1,X,o89qXvyRjJv0Rig-TCZLgoRC0h1E,1,97,X,1.1,X,10

Misc1.6764,22-16:59:36,1002,PlayerLogout,1001,1590369878,2219000000000000002,1,100,o89qXvyRjJv0Rig-TCZLgoRC0h1E,1,X,X,X,97

Misc1.6764,22-16:59:36,1003,PlayerDropStat,1001,1590369878,X,1,X,X,1,X,X,2219000000000000002,X,X,1,X,1
```

### xml文件格式

**目前测试的MySQL类型(`int`,`int unsigned`,`varchar(x)`,`float`,`bigint`)**

`Log.Single` - 单个日志落库项目
`Log.Single.struct.id` - 对应原始日志ID，**不可省略**
`Log.Single.struct.name` - 对应原始日志关键字，同样也是落库中表的名称，**不可省略**
`Log.Single.struct.indexkey` - 对应落库表中的索引 
`Log.Single.struct.desc` - 对应落库表的说明
`Log.Single.struct.entry.name` - 对应落库表中的字段名称，**不可省略**
`Log.Single.struct.entry.type` - 对应落库表中的字段类型，MySQL数据库所支持的类型，**不可省略**
`Log.Single.struct.entry.number` - 对应原始日志分隔符分隔后的位置，从1开始，**不可省略**
`Log.Single.struct.entry.desc` - 对应落库表中的字段说明
`Log.Multiple` - 多个日志落库项目
`Log.Multiple.struct.ids` - 对应协同日志组ID，`|`分隔，**不可省略**
`Log.Multiple.struct.name` - 对应落库中表的名称，**不可省略**
`Log.Multiple.struct.indexkey` - 对应落库表中的索引
`Log.Multiple.struct.script` - 对应处理日志组的脚本，路径为`app/plugin/`，**不可省略**
`Log.Multiple.struct.desc` - 对应落库表的说明
`Log.Multiple.struct.entry.name` - 对应落库表中的字段名称，**不可省略**
`Log.Multiple.struct.entry.type` - 对应落库表中的字段类型，MySQL数据库所支持的类型，**不可省略**
`Log.Multiple.struct.entry.desc` - 对应落库表中的字段说明

#### 例如

```xml
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<metalib name="Log" version="1">
  <command name="Single" desc="单个日志落库项目">
    <struct desc="玩家登陆" id="1001" name="PlayerLogin" indexkey="INDEX(`GameSvrId`)|INDEX(`PlayerID`)">
      <entry desc="登录的游戏服务器编号" name="GameSvrId" type="int" number="1"/>
      <entry desc="游戏事件的时间" name="EventTime" type="int unsigned" number="2"/>
      <entry desc="ios 0 /android 1" name="PlatID" type="int" number="4"/>
      <entry desc="微信 0 /手Q 1" name="AreaID" type="int" number="7"/>
      <entry desc="用户OPENID号" name="OpenID"  type="varchar(64)" number="6"/>
      <entry desc="角色唯一ID" name="PlayerID" type="bigint" number="3"/>
      <entry desc="等级" name="Level" type="int" number="8"/>
      <entry desc="玩家好友数量" name="PlayerFriendsNum" type="int" number="12"/>
      <entry desc="像素密度" name="Density" type="float" number="10"/>
    </struct>
  </command>
  <command name="Multiple" desc="多个日志落库项目">
    <struct desc="测试多日志1" ids="1001|1002|1003" name="Multi_Test1" indexkey="INDEX(`GameSvrId`)|INDEX(`PlayerID`)" script="test1.js">
      <entry desc="登录的游戏服务器编号" name="GameSvrId" type="int"/>
      <entry desc="记录时间" name="EventTime" type="int unsigned"/>
      <entry desc="ios 0 /android 1" name="PlatID" type="int"/>
      <entry desc="微信 0 /手Q 1" name="AreaID" type="int"/>
      <entry desc="角色唯一ID" name="PlayerID" type="bigint"/>
      <entry desc="状态" name="IState" type="int"/>
      <entry desc="掉线原因" name="IReason" type="int"/>
      <entry desc="(必填)本次登录在线时间(秒)" name="OnlineTime" type="int"/>
      <entry desc="(必填)等级" name="Level" type="int"/>
      <entry desc="像素密度" name="Density" type="float"/>
    </struct>
  </command>
</metalib>
```

### 启动

**数据库初始化和依赖**
``` sh
cd tool
node createInitSql.js
mysql -h xxx -P xxx -u xxx -p xxx <install.sql

cd ..
npm install
```
**启动**
```sh
cd bin
sh start.sh
```
**windows使用对应的xxx.bat**