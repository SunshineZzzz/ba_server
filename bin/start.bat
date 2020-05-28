@echo off

call :if_exist node.exe || (echo Command node.exe does not exist, please install nodejs and add environment variables && pause > nul && exit)

cd "../app/"
set NODE_ENV=production
start "baServer" node.exe app.js

:if_exist rem 判断某个命令是否存在
setlocal&PATH %PATH%;%~dp0%;%cd%
if "%~$PATH:1"=="" (
	exit /b 1
)
exit /b 0