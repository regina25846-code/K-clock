// 창 크기 맞추기 계산(1.4.3-3, PND-0330) — 좌표 계산만 하는 순수 함수라 맥에서도
// `rustc --test src/window_math.rs` 로 따로 시험한다.
//
// 예전엔 화면(JS)이 논리 좌표로 가운데를 계산하고 `Math.max(0, …)` 로 x 를 0 아래로 못
// 가게 막았다. 그런데 메인 모니터 왼쪽에 있는 모니터는 x 가 전부 음수라서, 크기를 다시
// 맞출 때마다(패널 열기·닫기, 알람 줄 다시 그리기, 글자색 자동 전환 등) 시계가 x=0,
// 즉 메인 모니터 왼쪽 끝으로 끌려왔다(형 1번 모니터 점프). 이제 전부 물리 픽셀로 계산하고,
// 가두는 범위는 0 이 아니라 "창이 지금 있는 모니터" 다.

/// (x, y, 너비, 높이) — 전부 물리 픽셀.
pub type Rect = (i32, i32, i32, i32);

/// 지금 창(`cur`)의 가로 가운데를 유지한 채 새 크기(`new_w`×`new_h`)로 바꿀 자리.
/// - 위쪽(y)은 그대로 둔다(시계가 위에 붙어 있고 패널이 아래로 자라는 구조라서).
/// - x 는 `mon`(창이 있는 모니터) 안으로만 가둔다. 창이 모니터보다 넓으면 모니터 왼쪽 끝.
/// - 모니터를 모르면(None) 가두지 않는다 — 0 으로 끌어오는 일은 절대 하지 않는다.
pub fn keep_center_rect(cur: Rect, new_w: i32, new_h: i32, mon: Option<Rect>) -> Rect {
    let (cx0, cy0, cw, _ch) = cur;
    let new_w = new_w.max(1);
    let new_h = new_h.max(1);
    // 가운데 = 왼쪽 + 너비/2. 반올림 방향이 음수에서도 같도록 2배로 계산한다.
    let center2 = 2 * cx0 as i64 + cw as i64;
    let mut x = ((center2 - new_w as i64) as f64 / 2.0).round() as i64;
    if let Some((mx, _my, mw, _mh)) = mon {
        if mw > 0 {
            let lo = mx as i64;
            let hi = mx as i64 + mw as i64 - new_w as i64;
            x = if hi < lo { lo } else { x.clamp(lo, hi) };
        }
    }
    (x as i32, cy0, new_w, new_h)
}

/// 화면(JS)이 주는 논리 크기(CSS px)를 창 배율로 물리 픽셀로 바꾼다. 배율이 이상하면 1.0.
pub fn to_phys(logical: f64, scale: f64) -> i32 {
    let s = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let v = if logical.is_finite() { logical } else { 0.0 };
    let p = (v * s).round();
    if p < 1.0 { 1 } else if p > 100_000.0 { 100_000 } else { p as i32 }
}

// ── 드래그 끝 감지(1.4.3-4, PND-0330) ──
// 창 드래그는 OS 가 맡아서(start_dragging) 그동안 화면(JS)에 mouseup 이 오지 않을 수 있다.
// 그래서 "창 이동 알림(WindowEvent::Moved)이 QUIET 동안 없고, 마우스 버튼이 떼어져 있음"을
// 드래그 끝으로 본다. 버튼을 누른 채 잠깐 멈춘 것은 끝이 아니다.
pub const MOVE_END_QUIET_MS: u64 = 120;
pub const MOVE_END_POLL_MS: u64 = 30;
pub fn move_end_due(pending: bool, now_ms: u64, last_move_ms: u64, button_down: bool) -> bool {
    pending && !button_down && now_ms.saturating_sub(last_move_ms) >= MOVE_END_QUIET_MS
}

#[cfg(test)]
mod tests {
    use super::*;
    // 형 배치(배율 전부 100%): 1번 1440×2560 세로 메인 왼쪽·위로 조금 높음,
    // 2번(메인) 5120×1440, 3번 2560×1600 메인 아래 가운데.
    const M1: Rect = (-1440, -300, 1440, 2560);
    const M2: Rect = (0, 0, 5120, 1440);
    const M3: Rect = (1280, 1440, 2560, 1600);

    #[test]
    fn monitor1_negative_x_stays_put() {
        // 1번 모니터 한가운데쯤, 시계만(300×90) → 패널 열기(300×420)
        let r = keep_center_rect((-900, -120, 300, 90), 300, 420, Some(M1));
        assert_eq!(r, (-900, -120, 300, 420));
        // 폭이 바뀌어도 가운데 유지: 가운데 -750
        let r = keep_center_rect((-900, -120, 300, 90), 220, 90, Some(M1));
        assert_eq!(r, (-860, -120, 220, 90));
    }
    #[test]
    fn monitor1_old_code_would_jump() {
        // 예전 계산(Math.max(0, …))이면 x=0 → 메인으로 점프. 새 계산은 음수 그대로.
        let r = keep_center_rect((-700, 500, 300, 90), 300, 90, Some(M1));
        assert!(r.0 < 0, "1번 모니터에서 x 가 음수로 남아야 한다: {:?}", r);
        assert_eq!(r.0, -700);
    }
    #[test]
    fn monitor1_edges_clamped_inside_monitor1_not_main() {
        // 1번 오른쪽 끝(메인과 맞닿은 곳)에서 넓어지면 1번 안쪽으로 밀리고 메인으로 넘어가지 않는다
        let r = keep_center_rect((-220, 100, 200, 90), 300, 90, Some(M1));
        assert_eq!(r.0, -300); // -1440+1440-300
        // 1번 왼쪽 끝
        let r = keep_center_rect((-1440, 100, 200, 90), 300, 90, Some(M1));
        assert_eq!(r.0, -1440);
    }
    #[test]
    fn negative_y_kept() {
        let r = keep_center_rect((-900, -250, 300, 90), 300, 400, Some(M1));
        assert_eq!(r.1, -250);
    }
    #[test]
    fn main_monitor_same_as_before() {
        let r = keep_center_rect((2000, 50, 300, 90), 240, 90, Some(M2));
        assert_eq!(r, (2030, 50, 240, 90));
        // 메인 왼쪽 끝: 예전 Math.max(0) 과 같은 결과
        let r = keep_center_rect((0, 0, 200, 90), 300, 90, Some(M2));
        assert_eq!(r.0, 0);
    }
    #[test]
    fn monitor3_below_main() {
        let r = keep_center_rect((2000, 1800, 300, 90), 300, 420, Some(M3));
        assert_eq!(r, (2000, 1800, 300, 420));
        let r = keep_center_rect((3800, 1800, 40, 90), 300, 90, Some(M3));
        assert_eq!(r.0, 3540); // 1280+2560-300
    }
    #[test]
    fn unknown_monitor_never_pulls_to_zero() {
        let r = keep_center_rect((-900, -120, 300, 90), 200, 90, None);
        assert_eq!(r.0, -850);
    }
    #[test]
    fn wider_than_monitor_goes_to_monitor_left() {
        let r = keep_center_rect((-900, 0, 300, 90), 2000, 90, Some(M1));
        assert_eq!(r.0, -1440);
    }
    #[test]
    fn repeated_resizes_do_not_drift() {
        // 열기·닫기 100번 반복해도 제자리
        let mut cur = (-901, -77, 300, 90);
        for i in 0..100 {
            let (w, h) = if i % 2 == 0 { (300, 420) } else { (300, 90) };
            cur = keep_center_rect(cur, w, h, Some(M1));
        }
        assert_eq!((cur.0, cur.1), (-901, -77));
        // 폭이 오가도(홀수 폭 포함) 1px 넘게 밀리지 않는다
        let mut cur = (-901, 10, 301, 90);
        for i in 0..100 {
            let w = if i % 2 == 0 { 217 } else { 301 };
            cur = keep_center_rect(cur, w, 90, Some(M1));
        }
        assert!((cur.0 - (-901)).abs() <= 1, "{:?}", cur);
    }
    #[test]
    fn scale_125_and_150() {
        assert_eq!(to_phys(300.0, 1.25), 375);
        assert_eq!(to_phys(90.0, 1.5), 135);
        // 배율 1.25 인 1번 모니터(물리 1800 폭이라 치면 [-1800,0])
        let m: Rect = (-1800, -300, 1800, 3200);
        let cur = (-1100, -150, to_phys(300.0, 1.25), to_phys(90.0, 1.25));
        let r = keep_center_rect(cur, to_phys(300.0, 1.25), to_phys(420.0, 1.25), Some(m));
        assert_eq!(r, (-1100, -150, 375, 525));
        // 1.5 배율에서 폭이 좁아질 때 가운데 유지: 가운데 -1100+225=-875 → 새 폭 330 → -1040
        let cur = (-1100, -150, to_phys(300.0, 1.5), 135);
        let r = keep_center_rect(cur, to_phys(220.0, 1.5), 135, Some((-2160, -300, 2160, 3840)));
        assert_eq!(r, (-1040, -150, 330, 135));
    }
    #[test]
    fn straddling_monitor_boundary() {
        // 1번과 메인 경계에 걸침(창 대부분이 1번) — 1번 안으로 들어온다(메인 x=0 이 아니라)
        let r = keep_center_rect((-150, 200, 300, 90), 300, 420, Some(M1));
        assert_eq!(r.0, -300);
        // 대부분이 메인이면(모니터=M2) 메인 안으로
        let r = keep_center_rect((-50, 200, 300, 90), 300, 420, Some(M2));
        assert_eq!(r.0, 0);
    }
    #[test]
    fn widen_and_narrow() {
        let r = keep_center_rect((1000, 10, 200, 90), 300, 90, Some(M2));
        assert_eq!(r.0, 950);
        let r = keep_center_rect((950, 10, 300, 90), 200, 90, Some(M2));
        assert_eq!(r.0, 1000);
    }
    #[test]
    fn to_phys_bad_input() {
        assert_eq!(to_phys(f64::NAN, 1.0), 1);
        assert_eq!(to_phys(300.0, f64::NAN), 300);
        assert_eq!(to_phys(300.0, 0.0), 300);
        assert_eq!(to_phys(1e12, 2.0), 100_000);
    }
    #[test]
    fn move_end_detection() {
        // 움직인 적 없으면 안 보냄
        assert!(!move_end_due(false, 10_000, 0, false));
        // 마지막 이동 직후엔 아직
        assert!(!move_end_due(true, 1_000 + MOVE_END_QUIET_MS - 1, 1_000, false));
        // 조용해지면 보냄
        assert!(move_end_due(true, 1_000 + MOVE_END_QUIET_MS, 1_000, false));
        // 버튼을 누른 채 멈춰 있으면 아직(끌다가 잠깐 멈춘 것)
        assert!(!move_end_due(true, 9_000, 1_000, true));
        // 시계가 거꾸로 가도(last > now) 멈추지 않고 안 보냄
        assert!(!move_end_due(true, 500, 1_000, false));
        // 최악 지연 = 조용 대기 + 한 번 확인 주기 ≤ 0.3초
        assert!(MOVE_END_QUIET_MS + MOVE_END_POLL_MS <= 300);
        // 빠르게 끌다 놓기 흉내: 16ms 마다 이동, 버튼 뗀 순간부터 첫 신호까지
        let mut last = 0u64; let mut t = 0u64; let mut fired_at = None;
        for step in 0..200u64 {
            t = step * 16;
            let dragging = step < 100;
            if dragging { last = t; }
            // 확인 스레드는 POLL 간격으로만 본다
            if t % MOVE_END_POLL_MS < 16 && move_end_due(true, t, last, dragging) { fired_at = Some(t); break; }
        }
        let released = 99 * 16;
        let lat = fired_at.expect("신호가 와야 한다") - released;
        assert!(lat <= MOVE_END_QUIET_MS + MOVE_END_POLL_MS + 16, "지연 {}ms", lat);
        let _ = t;
    }
    #[test]
    fn bad_sizes_do_not_panic() {
        let _ = keep_center_rect((i32::MIN / 2, 0, 300, 90), 0, -5, Some(M1));
        let _ = keep_center_rect((i32::MAX / 2, 0, 300, 90), 300, 90, Some((0, 0, 0, 0)));
    }
}
