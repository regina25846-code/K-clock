#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
fn set_always_on_top(window: tauri::Window, on_top: bool) {
    let _ = window.set_always_on_top(on_top);
}

// 2026-08-02: tao(Tauri의 Windows 백엔드)의 set_always_on_top는 내부에 저장된 상태값과
// 요청값이 같으면 실제 SetWindowPos 호출 자체를 건너뛴다(WindowFlags::apply_diff의
// diff-empty 조기 리턴, tao 소스로 직접 확인함). 그래서 이미 topmost인 상태에서 계속
// true만 반복 호출하면 아무 효과가 없음 — 다른 항상위 창에 밀려도 절대 다시 안 올라옴.
// false→true로 강제 토글하는 방식으로 처음 고쳤더니 실제로 다시 올라오긴 하는데,
// 매 주기마다 잠깐 항상위가 풀렸다 붙는 게 눈에 보이는 깜빡임으로 나타남(형 실측 확인).
// 그래서 tao의 캐시된 플래그를 아예 우회하고, Win32 SetWindowPos(HWND_TOPMOST)를
// 직접 호출 — 이미 맨 위에 있어도 이 호출 자체는 화면 변화가 없어서 깜빡임 없이
// 매번 진짜로 재적용됨.
#[cfg(windows)]
fn force_topmost(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    unsafe {
        let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

#[tauri::command]
fn refresh_always_on_top(window: tauri::Window) {
    #[cfg(windows)]
    {
        if let Ok(hwnd) = window.hwnd() {
            force_topmost(hwnd);
            return;
        }
    }
    // Windows가 아니거나 hwnd 조회 실패 시 폴백(깜빡임 있을 수 있으나 안전한 기존 방식)
    let _ = window.set_always_on_top(false);
    let _ = window.set_always_on_top(true);
}

// 2026-08-02: 알람 소리를 앱에 번들하는 대신, 사용자 자신의 윈도우가 이미 갖고 있는
// 시스템 사운드(C:\Windows\Media 상당 경로)를 그대로 참조하게 해서 저작권 문제를
// 피하면서 소리 선택지를 늘림 — 파일을 앱에 복사/포함하지 않고 경로만 읽는다.
// 드라이브 문자를 하드코딩하면 윈도우를 C: 외 다른 드라이브에 설치한 사용자에게
// 깨지므로, 윈도우가 제공하는 SystemRoot 환경변수로 실제 설치 경로를 물어봄.
#[tauri::command]
fn list_system_sounds() -> Vec<serde_json::Value> {
    let mut sounds = Vec::new();
    #[cfg(windows)]
    {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        let media_dir = std::path::Path::new(&root).join("Media");
        if let Ok(entries) = std::fs::read_dir(&media_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let is_wav = path
                    .extension()
                    .map(|e| e.eq_ignore_ascii_case("wav"))
                    .unwrap_or(false);
                if is_wav {
                    if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                        // 알람으로 쓰기 적당한 "또렷한" 계열만 남김 — 전체 목록은 너무
                        // 잡다해서 형이 알람/링 계열만 남기라고 지정함(2026-08-02).
                        // ringin/ringout(통화 연결음 계열)은 "ring"에 걸려 같이 들어왔었는데
                        // 알람용으로 안 맞아서 형이 제외 요청함(2026-08-02).
                        let lower = name.to_lowercase();
                        let is_ring_call = lower.contains("ringin") || lower.contains("ringout");
                        if (lower.contains("alarm") || lower.contains("ring")) && !is_ring_call {
                            sounds.push(serde_json::json!({
                                "name": name,
                                "path": path.to_string_lossy().to_string()
                            }));
                        }
                    }
                }
            }
        }
        sounds.sort_by(|a, b| a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or("")));
    }
    sounds
}

// asset protocol의 scope 설정(tauri.conf.json)은 정적 glob이라 드라이브 문자가 바뀌면
// 대응 못 하는 문제가 똑같이 생겨서, 대신 Rust가 직접 바이트를 읽어 IPC로 넘기고
// 프런트엔드에서 그때그때 Blob URL로 재생한다(스코프 설정 자체가 불필요해짐).
#[tauri::command]
fn read_system_sound(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn close_app(app: tauri::AppHandle) {
    app.exit(0);
}

// 업데이트 안내 카드의 "전체 변경 내역" 링크용 — 시스템 기본 브라우저로 연다.
// Cargo.toml에 opener/shell 플러그인이 없어서 다른 커맨드들과 같은 방식(직접 프로세스 실행)으로 처리.
// https:// 스킴만 허용(임의 프로토콜/로컬 파일 경로 실행 방지).
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("invalid_scheme".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
fn start_dragging(window: tauri::Window) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn get_window_pos(window: tauri::Window) -> (i32, i32) {
    let pos = window.outer_position().unwrap_or(tauri::PhysicalPosition { x: 0, y: 0 });
    let scale = window.scale_factor().unwrap_or(1.0);
    ((pos.x as f64 / scale).round() as i32, (pos.y as f64 / scale).round() as i32)
}

#[tauri::command]
fn set_window_pos(window: tauri::Window, x: i32, y: i32) {
    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: x as f64, y: y as f64 }));
}

#[tauri::command]
fn set_window_height(window: tauri::Window, height: u32) {
    let current = window.outer_size().unwrap_or(tauri::PhysicalSize { width: 300, height: 90 });
    let scale = window.scale_factor().unwrap_or(1.0);
    let cur_w = (current.width as f64 / scale) as u32;
    let _ = window.set_resizable(true);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: cur_w as f64, height: height as f64 }));
    let _ = window.set_resizable(false);
}

#[tauri::command]
fn set_window_size(window: tauri::Window, width: u32, height: u32) {
    let _ = window.set_resizable(true);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: width as f64, height: height as f64 }));
    let _ = window.set_resizable(false);
}

// syncWindowWidth()가 예전엔 get_window_pos → set_window_size → set_window_pos 순으로
// IPC 왕복을 3번 했는데, 크기 변경과 위치 변경 사이에 프레임이 끼어들면서 "창이 커졌다가
// 다시 중앙으로 옮겨지는" 2단계 움직임이 눈에 보이는 떨림으로 나타났음(형이 스타일 전환 시
// 발견, 2026-08-02, 오푸스 리뷰로 원인 규명). IPC 왕복을 하나로 합친 1차 수정(set_size+
// set_position을 한 Rust 커맨드 안에서 연달아 호출) 이후에도 형이 떨림을 재확인함 —
// tauri::Window::set_size/set_position은 내부적으로 각각 별도의 SetWindowPos 호출이라
// Rust 함수 하나로 묶어도 OS 입장에서는 여전히 두 번의 창 변경이라 그 사이 리페인트가
// 끼어들 수 있음. Windows에서는 raw SetWindowPos를 x/y/cx/cy 전부 한 번에 넘겨서
// 진짜 단일 OS 호출로 처리(항상위 강제 적용 때 이미 쓰던 것과 같은 FFI 패턴).
#[cfg(windows)]
fn set_window_rect_native(hwnd: windows::Win32::Foundation::HWND, x: i32, y: i32, cx: i32, cy: i32) {
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
    unsafe {
        let _ = SetWindowPos(hwnd, None, x, y, cx, cy, SWP_NOZORDER | SWP_NOACTIVATE);
    }
}

#[tauri::command]
fn set_window_rect(window: tauri::Window, x: i32, y: i32, width: u32, height: u32) {
    #[cfg(windows)]
    {
        if let Ok(hwnd) = window.hwnd() {
            let scale = window.scale_factor().unwrap_or(1.0);
            let px = (x as f64 * scale).round() as i32;
            let py = (y as f64 * scale).round() as i32;
            let pw = (width as f64 * scale).round() as i32;
            let ph = (height as f64 * scale).round() as i32;
            let _ = window.set_resizable(true);
            set_window_rect_native(hwnd, px, py, pw, ph);
            let _ = window.set_resizable(false);
            return;
        }
    }
    let _ = window.set_resizable(true);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: width as f64, height: height as f64 }));
    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: x as f64, y: y as f64 }));
    let _ = window.set_resizable(false);
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) {
    let mgr = app.autolaunch();
    if enabled { let _ = mgr.enable(); } else { let _ = mgr.disable(); }
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn close_about(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("about") {
        let _ = win.destroy();
    }
}

// About 창 다크/라이트 자동전환용 — K-Clock엔 다크/라이트 토글이 없고 "밝기"(0~255)
// 슬라이더만 있어서, 프론트에서 슬라이더 바뀔 때마다 set_brightness로 이 값을 갱신해두고
// About 창을 열 때 그 값을 쿼리파라미터로 넘긴다(about.html이 127 이하면 다크로 렌더).
#[tauri::command]
fn set_brightness(state: tauri::State<std::sync::Mutex<u8>>, value: u8) {
    *state.lock().unwrap() = value;
}

#[tauri::command]
fn open_about(app: tauri::AppHandle, brightness: tauri::State<std::sync::Mutex<u8>>) {
    if let Some(win) = app.get_webview_window("about") {
        let _ = win.set_focus();
        return;
    }
    let b = *brightness.lock().unwrap();
    let _ = tauri::WebviewWindowBuilder::new(
        &app,
        "about",
        tauri::WebviewUrl::App(format!("about.html?v={}&b={}", env!("CARGO_PKG_VERSION"), b).into()),
    )
    .title("프로그램 정보")
    // 카드 320px + about.html의 body padding(좌우 28px) = 376.
    // 그림자가 창 밖으로 나가면 OS 창 경계에서 직선으로 잘려 모서리가 각져 보이므로
    // 창은 반드시 카드보다 그림자 여백만큼 커야 한다(2026-08-25).
    // 높이는 로드 직후 syncAboutHeight()가 실측값으로 다시 맞춘다.
    .inner_size(376.0, 525.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    // 메인 시계창(tauri.conf.json)엔 이미 shadow:false가 있는데 여기(Rust로 동적 생성하는
    // 창)엔 빠져있었음 — Windows 기본 각진 창 그림자가 새로 그린 둥근 CSS 그림자와 겹쳐서
    // 카드 옆으로 각진 그림자가 튀어나와 보이는 원인(2026-08-24 형 실기 확인으로 발견).
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .build()
    .map(|win| { let _ = win.center(); });
}

// 프로그램 정보 창의 "업데이트 확인" 버튼이 실제로 호출하는 명령 — 이전엔 시작 시 조용히
// 한 번 백그라운드 체크만 하고(update-available 이벤트도 프론트에서 아무도 안 들어서
// 무용지물이었음) 버튼 자체는 disabled + 고정 텍스트라 눌러도 아무 일도 안 일어났음.
// 업데이트를 찾으면 바로 다운로드+설치까지 진행하고 재시작(Windows는 설치 단계에서
// 앱이 자동 종료됨 — Tauri 공식 문서에 명시된 동작).
#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    match update {
        Some(update) => {
            let version = update.version.clone();
            update
                .download_and_install(|_, _| {}, || {})
                .await
                .map_err(|e| e.to_string())?;
            app.restart();
            Ok(Some(version))
        }
        None => Ok(None),
    }
}

fn main() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(220u8))
        .plugin(tauri_plugin_window_state::Builder::default()
            .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION | tauri_plugin_window_state::StateFlags::SIZE)
            .build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(updater) = handle.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        let _ = handle.emit("update-available", update.version);
                    }
                }
            });

            let show = MenuItem::with_id(app, "show", "K-Clock 보이기", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let settings = MenuItem::with_id(app, "settings", "설정", true, None::<&str>)?;
            let info = MenuItem::with_id(app, "info", "프로그램 정보", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "프로그램 종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &sep1, &settings, &info, &sep2, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.eval("openPanel('settings')");
                        }
                    }
                    "info" => {
                        open_about(app.clone(), app.state::<std::sync::Mutex<u8>>());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "about" {
                    return;
                }
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_always_on_top,
            minimize_window,
            close_app,
            open_url,
            hide_window,
            set_window_height,
            set_window_size,
            set_window_rect,
            get_window_pos,
            set_window_pos,
            start_dragging,
            set_autostart,
            get_autostart,
            open_about,
            close_about,
            set_brightness,
            check_for_update,
            refresh_always_on_top,
            list_system_sounds,
            read_system_sound,
        ])
        .run(tauri::generate_context!())
        .expect("K-Clock 실행 실패");
}
