; K-앱 공통 설치 흐름 표준 — 제거 시 애플리케이션 데이터 삭제 여부 확인(기본은 삭제 안 함).
; Tauri 2 NSIS installerHooks의 POSTUNINSTALL 매크로: 파일/레지스트리/바로가기가 모두 제거된 뒤 실행됨.
; (설치 위치 표시·완료 화면 실행/바탕화면 바로가기·업그레이드 시 기존 버전 처리는 Tauri 기본 제공)

!macro NSIS_HOOK_POSTUNINSTALL
  ; 새 버전 설치 중 기존 버전을 자동으로 지우는 silent 제거일 때는 묻지 않고 데이터 보존.
  ; 사용자가 직접 "제거"할 때(비-silent)만 데이터 삭제 여부를 물어본다.
  IfSilent kclock_keep_data
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "K-Clock 설정 데이터(시계 설정 등)도 함께 삭제하시겠습니까?$\n$\n[아니오]를 선택하면 설정은 보존됩니다." IDNO kclock_keep_data
    RMDir /r "$APPDATA\com.kris.clock"
    RMDir /r "$LOCALAPPDATA\com.kris.clock"
  kclock_keep_data:
!macroend
