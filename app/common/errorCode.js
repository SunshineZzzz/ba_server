'use strict';

let errorCode = {};

// 进程退出错误码
errorCode.eixtCode = {
	// 正常退出
	normal: 0,
	// 运行时错误退出
	rtErr: 1,
	// worker心跳退出
	hbErr: 2,
	// 启动异常
	startErr: 3,
};

// 内部错误码
errorCode.innerCode = {
	// 处理成功，需要关心body
	ok: 0,
	// 传入参数有误
	param: -1,
	// 网络通信异常
	net: -2,
	// 超时
	timeout: -3,
	// API返回异常
	api: -4,
};

module.exports = errorCode;