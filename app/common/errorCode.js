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
}

module.exports = errorCode;