@echo off
setlocal

REM Set Java and Android environment variables
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.5.11-hotspot"
set "ANDROID_HOME=C:\Users\idfld\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"

REM Clear any Gradle init scripts from VS Code
set "GRADLE_USER_HOME=%USERPROFILE%\.gradle"

REM Disable VS Code Java extension interference
set "GRADLE_OPTS=-Dorg.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8"
set "JAVA_TOOL_OPTIONS="

REM Run gradlew with no init scripts and disable daemon for clean build
"%~dp0gradlew.bat" %* --no-scan --no-daemon -Dorg.gradle.java.home="%JAVA_HOME%"
