; ===== 설치 흐름 표준 1번(K-Music/K-Memo와 동일): 이미 설치돼있으면 제거하기/제거하지 않기부터 선택 =====
; Tauri NSIS 번들러는 electron-builder와 달리 레지스트리 키 이름 규칙이 달라서(정확히 확인 불가),
; 레지스트리 대신 설치 폴더 안의 uninstall.exe 존재 여부로 "이미 설치돼있는지"를 판단.
; IfSilent로 자동업데이트(무인 재설치, /S 옵션)일 땐 무조건 건너뛰어서 팝업이 자동업데이트를 막지 않게 함.
;
; 2026-08-02: 이 훅이 섹션마다(한 번의 Setup 실행 안에서 여러 번) 호출되는 것으로 실측 확인됨
; (설치 진행 중에 같은 질문이 다시 뜨는 버그 재현) — 한 번의 실행에서 최초 1회만 묻도록
; 전역 플래그로 가드 처리.
Var /GLOBAL ktClockPreinstallAsked

!macro NSIS_HOOK_PREINSTALL
  StrCmp $ktClockPreinstallAsked "1" nsis_hook_preinstall_skip
  StrCpy $ktClockPreinstallAsked "1"
  IfSilent nsis_hook_preinstall_skip
  IfFileExists "$INSTDIR\uninstall.exe" 0 nsis_hook_preinstall_skip
    MessageBox MB_YESNO|MB_ICONQUESTION "K-Clock이 이미 설치되어 있습니다.$\n기존 버전을 제거하시겠습니까?$\n$\n예: 제거하기(제거 후 Setup을 다시 실행해서 새로 설치)$\n아니오: 제거하지 않고 계속 설치(업데이트)" IDYES nsis_hook_preinstall_remove IDNO nsis_hook_preinstall_skip
    nsis_hook_preinstall_remove:
      ExecWait '"$INSTDIR\uninstall.exe" _?=$INSTDIR'
      Quit
  nsis_hook_preinstall_skip:
!macroend
