# 조상님 단톡쓰신다 · Story Studio

역사 사건을 단톡·SNS·웹툰 나레이션·사진·결말 장면으로 조합하는 **에피소드형 숏폼 제작 워크스페이스**.

## 시작

- **Studio:** [studio.html](studio.html) / 배포: https://jyosangnim-dm.vercel.app/studio.html
- **기존 단톡 제작기와 WebM 녹화:** [index.html](index.html) / 배포: https://jyosangnim-dm.vercel.app/
- **제작 구조 및 규칙:** [docs/studio/ARCHITECTURE.md](docs/studio/ARCHITECTURE.md)
- **에피소드 목록:** [episodes/manifest.json](episodes/manifest.json)

기존 단톡 플레이어와 저장 데이터는 유지됩니다. Studio v0.1은 장면 조합과 편집 중심으로 시작하며 **Studio 장면의 통합 WebM 렌더링은 아직 구현되지 않았습니다**.

## Studio 사용법

1. 에피소드 선택 · 타임라인에서 장면 클릭
2. 원고·장면 종류·길이·전환·스타일을 수정하거나 장면 추가·순서 변경·삭제
3. 사진을 올리면 해당 에피소드 전용 IndexedDB에 보관되며 현재 장면에 이미지 참조가 추가됩니다.
4. 에피소드마다 **별도의 로컬 초안**으로 자동 저장됩니다.
5. **검수 ZIP 내보내기**로 원고 파일, `episode.json`, 브라우저에 추가한 이미지, `studio-draft.json`, 메타데이터를 묶습니다.
6. GitHub-connected assistant/agent에게 ZIP을 전달해 검토·등록하면 배포본을 업데이트할 수 있습니다. **브라우저에서 GitHub로 직접 푸시하지는 않습니다.**

`studio-draft.json`은 ZIP에서 꺼내 **초안 JSON 가져오기**로 불러올 수 있습니다. 로컬 사진 파일은 별도로 IndexedDB에 저장되며, JSON 단독으로는 전송되지 않습니다.

## 포맷

```text
episodes/
  manifest.json
  sukjong-gisa-1689/
    episode.json
    scenes/
      intro.md
      council.chat
      announcement.post.md
      reaction.chat
      context.md
      purge.chat
      outro.md
    assets/   # GitHub에 정식 등록된 사진
```

`episode.json`은 장면의 **순서·종류·시간·변환·리소스 경로**만 기록합니다. 실제 내용은 장면별 파일에 적습니다.

채팅 원고 예:

```text
- 숙종: 발표하겠습니다
- [share] 숙종 > announcement
- 서인: ?
- [kick] 숙종 > 송시열
- [invite] 숙종 > 남인
```

SNS 원고 예:

```text
# 숙종
@royal_official

금일부로 원자 책봉을 추진하겠습니다.
```

자세한 장면 확장 규칙은 Architecture 문서를 따릅니다.

## 보존된 기존 제작기

`index.html`은 `title$...`, `char[]`, `send$...`, `picture$...`, `avatar$...`, `rename$...` 등의 기존 대본을 그대로 지원합니다. 녹화는 브라우저 `MediaRecorder` 기반 **영상만 있는 720×1280 WebM**이며 길이 메타데이터 보정 로직이 포함됩니다.

두 에디터는 저장소를 별도로 사용합니다. 기존 단톡 대본과 기존 이미지가 새 Studio에 자동 변환되지는 않습니다. **기존 앱 데이터를 삭제하지 마세요.**

## 프로젝트 성격

실제 카카오톡·SNS 서비스와 무관한 역사 기반 창작 패러디입니다. 역사적 사실과 창작 대사를 구분해 주세요.
