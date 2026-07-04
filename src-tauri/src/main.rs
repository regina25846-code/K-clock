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

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn close_app(app: tauri::AppHandle) {
    app.exit(0);
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
    ((pos.x as f64 / scale) as i32, (pos.y as f64 / scale) as i32)
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
fn open_about(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("about") {
        let _ = win.set_focus();
        return;
    }
    let _ = tauri::WebviewWindowBuilder::new(
        &app,
        "about",
        tauri::WebviewUrl::App("about.html".into()),
    )
    .title("프로그램 정보")
    .inner_size(320.0, 360.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .build();
}

fn main() {
    tauri::Builder::default()
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
                        open_about(app.clone());
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
            hide_window,
            set_window_height,
            set_window_size,
            get_window_pos,
            set_window_pos,
            start_dragging,
            set_autostart,
            get_autostart,
            open_about,
        ])
        .run(tauri::generate_context!())
        .expect("K-Clock 실행 실패");
}
