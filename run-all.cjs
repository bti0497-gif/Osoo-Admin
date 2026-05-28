const { spawn } = require('child_process');

const FRONTEND_PORT = 8900;
const BACKEND_PORT_MIN = 8901;
const BACKEND_PORT_MAX = 8951;

let backend = null;
let frontend = null;
let electron = null;
let isShuttingDown = false;

console.log('Starting Frontend (Vite), Backend (Node), and Electron...');

function buildWindowsCleanupScript() {
    const scriptRoot = __dirname.replace(/'/g, "''");
    const currentPid = process.pid;

        return `
$ErrorActionPreference = 'SilentlyContinue'
$root = '${scriptRoot}'
$currentPid = ${currentPid}
$candidateIds = New-Object 'System.Collections.Generic.HashSet[int]'

Get-CimInstance Win32_Process |
    Where-Object {
        $_.ProcessId -ne $currentPid -and
        $_.CommandLine -and
        $_.CommandLine -match [regex]::Escape($root) -and
        (
            $_.CommandLine -match 'run-all\\.cjs' -or
            $_.CommandLine -match 'start\\.cjs' -or
            $_.CommandLine -match 'server\\.cjs' -or
            $_.CommandLine -match 'vite(?:\\.js)?' -or
            $_.CommandLine -match 'npm(?:\\.cmd)?\\s+run\\s+dev(?::all)?' -or
            $_.CommandLine -match 'electron(?:\\.exe)?'
        )
    } |
    ForEach-Object { [void]$candidateIds.Add([int]$_.ProcessId) }

$candidateIds | ForEach-Object { Stop-Process -Id $_ -Force }
Start-Sleep -Milliseconds 1500
`.trim();
}

function cleanupExistingDevProcesses() {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            resolve();
            return;
        }

        const killer = spawn('powershell.exe', ['-NoProfile', '-Command', buildWindowsCleanupScript()], {
            stdio: 'inherit',
            cwd: __dirname,
        });

        killer.on('exit', () => resolve());
        killer.on('error', () => resolve());
    });
}

function spawnCommand(command, args, options = {}) {
    return spawn(command, args, {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true,
        ...options,
    });
}

function killProcessTree(childProcess) {
    if (!childProcess || childProcess.killed) {
        return;
    }

    if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(childProcess.pid), '/t', '/f'], {
            stdio: 'ignore',
            shell: true,
        });
        killer.on('error', () => {
            try { childProcess.kill('SIGTERM'); } catch (_) {}
        });
        return;
    }

    try {
        childProcess.kill('SIGTERM');
    } catch (_) {}
}

function shutdown(exitCode = 0) {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;
    console.log('\nShutting down dev servers...');
    killProcessTree(frontend);
    killProcessTree(backend);
    killProcessTree(electron);

    setTimeout(() => process.exit(exitCode), 500);
}

function bindChildExit(childProcess, label) {
    childProcess.on('exit', (code, signal) => {
        if (isShuttingDown) {
            return;
        }

        const exitCode = typeof code === 'number' ? code : 0;
        console.log(`[${label}] exited (code=${code}, signal=${signal})`);
        shutdown(exitCode);
    });

    childProcess.on('error', (error) => {
        if (isShuttingDown) {
            return;
        }

        console.error(`[${label}] failed to start: ${error.message}`);
        shutdown(1);
    });
}

async function waitForServers() {
    // 서버들이 준비될 시간을 줌 (3초)
    console.log('[run-all] Waiting 3 seconds for servers to be ready...');
    await new Promise(r => setTimeout(r, 3000));
}

async function startAll() {
    await cleanupExistingDevProcesses();

    // 개발환경에서는 run-all 자체가 프로세스 생명주기를 관리하므로
    // 워치독(start.cjs) 대신 실제 서버 엔트리포인트를 직접 실행한다.
    backend = spawnCommand('node', ['server.cjs'], {
        env: { ...process.env },
    });
    frontend = spawnCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
        env: { ...process.env },
    });

    bindChildExit(backend, 'backend');
    bindChildExit(frontend, 'frontend');

    // Electron은 dev 서버를 사용하도록 강제 (빌드된 파일 무시)
    await waitForServers();
    console.log('[run-all] Starting Electron...');
    electron = spawnCommand(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', '.'], {
        env: { 
            ...process.env,
            ELECTRON_FORCE_DEV_SERVER: '1'  // dev 서버 강제 사용
        },
    });
    bindChildExit(electron, 'electron');

    process.on('SIGINT', () => shutdown(0));
    process.on('SIGTERM', () => shutdown(0));
}

startAll().catch((error) => {
    console.error(`Failed to start dev servers: ${error.message}`);
    shutdown(1);
});
