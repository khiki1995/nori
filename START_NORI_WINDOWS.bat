@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo  NORI V0.2.7 — запуск локального сервера
 echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Установите Node.js версии 18 или новее с https://nodejs.org/ , затем снова запустите этот файл.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Не найден npm. Переустановите Node.js с сайта https://nodejs.org/ .
  pause
  exit /b 1
)
if not exist "node_modules\ws\package.json" (
  echo Первый запуск: устанавливаю зависимости. Нужен интернет.
  call npm install
  if errorlevel 1 (
    echo Не удалось установить зависимости. Проверьте интернет и повторите запуск.
    pause
    exit /b 1
  )
)
start "NORI server" /D "%~dp0" cmd /k "npm start"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
echo Если сайт не открылся автоматически, перейдите вручную: http://localhost:3000
echo Google-вход требует настройки OAuth в файле .env. См. docs\GOOGLE_AUTH_SETUP_RU.md.
echo Сервер работает в отдельном окне. Не закрывайте его во время игры.
pause
