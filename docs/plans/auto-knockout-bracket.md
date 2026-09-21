# 조별리그 1·2위 자동 본선(토너먼트) 진출

> 상태: 구현 완료.

## Context

현재는 조별리그(라운드로빈) 경기가 모두 확정되어도, 관리자가 `/admin/standings`에서 부문을 선택하고 "토너먼트 대진 생성" 버튼을 수동으로 눌러야만 본선 대진표가 만들어짐. 사용자는 각 조 1·2위가 결정되는 즉시(버튼 클릭 없이) 자동으로 본선 대진표가 생성되어, 해당 팀들이 바로 자기 팀 화면에서 대진을 확인하고 승패를 입력할 수 있길 원함.

조사 결과 이미 구현되어 있는 부분:
- 본선 대진 생성 로직 자체(`app/actions/admin.ts`의 `generateKnockoutBracket`) — 조별리그 전체 확정 여부 확인 → 순위 계산 → 시드 배정 → 대진 생성 → Firestore 커밋까지 전부 이미 있음. 지금은 관리자가 수동으로만 호출 가능.
- 진출한 팀이 본선 경기를 보고 승패를 입력하는 기능 — `app/team/[teamId]/page.tsx`, `app/actions/participant.ts`가 이미 스테이지(group/knockout) 구분 없이 완전히 동작함. 본선 경기 문서가 Firestore에 생성되기만 하면, 해당 팀 화면은 6초 폴링(`PollOnInterval`)으로 자동 반영되고, 진출하지 못한 팀은 애초에 해당 경기 문서에 연결되지 않으므로 보이지도 접근하지도 못함. **이 부분은 코드 변경 불필요.**
- 이 앱은 Firestore Cloud Function이 없고 100% Next.js 서버 액션(브라우저 요청 시에만 실행)으로 동작함 → "자동 생성"은 조별리그 마지막 경기가 확정되는 바로 그 서버 액션 안에서 트리거해야 함.

부족한 부분: 조별리그의 "마지막 경기가 확정되는 순간" 자동으로 본선 대진 생성 로직을 실행하는 트리거가 없음. 이를 추가한다.

## 접근 방식

**진출 인원수는 2명(1·2위)으로 고정.** 사용자가 명시한 대회 규칙이며, 별도 설정 UI는 만들지 않음. 기존 수동 버튼(다른 진출 인원수 필요 시 대비용)은 그대로 유지.

### 1. 새 파일: `lib/bracket/autoGenerateKnockout.ts`

`generateKnockoutBracket`(관리자 수동, 상세 에러 반환)과 로직은 거의 같지만, **에러를 절대 사용자에게 노출하지 않고 항상 조용히 실패하는** 별도의 함수로 만든다 (관리자 수동 버튼의 기존 에러 메시지/동작에 영향 없도록 의도적으로 분리, 공유 리팩터링 하지 않음):

```ts
const ADVANCE_COUNT = 2; // 고정: 조 1·2위 진출

export async function autoGenerateKnockoutBracket(
  tournamentId: string,
  division: string
): Promise<{ generated: boolean; matchCount?: number }> {
  try {
    const matchesSnap = await matchesCol(tournamentId).get();
    const divisionMatches = matchesSnap.docs.map(d => d.data()).filter(m => m.division === division);

    if (divisionMatches.some(m => m.stage === "knockout")) return { generated: false }; // 이미 생성됨 (멱등성)

    const groupMatches = divisionMatches.filter(m => m.stage === "group");
    if (groupMatches.length === 0) return { generated: false };
    if (groupMatches.some(m => m.status !== "confirmed")) return { generated: false }; // 아직 다 안 끝남

    const teamsSnap = await teamsCol(tournamentId).get();
    const teams = teamsSnap.docs.map(d => d.data()).filter(t => t.division === division);
    if (teams.length === 0) return { generated: false };

    const standingsByGroup = computeGroupStandings(teams, groupMatches);
    const seedsResult = buildSeedList(standingsByGroup, ADVANCE_COUNT);
    if ("error" in seedsResult) return { generated: false }; // 예: 한 조에 팀이 2개 미만

    const bracketResult = buildKnockoutBracket(seedsResult);
    if ("error" in bracketResult) return { generated: false };

    const { matchCount } = await commitKnockoutBracket(tournamentId, division, bracketResult, Date.now());
    return { generated: true, matchCount };
  } catch {
    return { generated: false }; // 관계없는 경기를 확정한 팀에게 에러를 노출하지 않음
  }
}
```

**동시성(race condition) 처리**: Firestore 트랜잭션은 쓰지 않음 (사람이 순차적으로 입력하는 저트래픽 앱이라 과설계로 판단). 위 "이미 knockout 존재?" 체크가 1차 방어. 매우 드문 극단적 동시 확정 시 중복 생성 가능성이 이론상 남지만, 실사용에서 거의 불가능한 타이밍이라 수용하고 별도 잠금 로직은 추가하지 않음.

### 2. 세 곳의 "경기 확정" 지점에 연결 (모두 `match.stage === "group"`일 때만 호출)

- `app/actions/participant.ts` `confirmMatchScore` — 팀이 상대팀 점수를 확인해 확정하는 지점. 기존 `applyCascadingAdvancement` 호출 바로 다음에 추가. 이 액션은 본선 생성을 유발할 수 있으므로 `revalidatePath("/admin/standings")`, `revalidatePath("/admin/matches")`도 함께 추가 (관리자 화면도 새로고침 없이 반영).
- `app/actions/admin.ts` `resolveMatchDispute` — 관리자가 분쟁 경기를 확정하는 지점. 동일하게 `applyCascadingAdvancement` 다음에 추가.
- `app/actions/admin.ts` `overrideMatchScore` — 관리자가 점수를 강제 확정(부전승 등)하는 지점. 동일하게 추가.

기존 `generateKnockoutBracket`(관리자 수동 버튼)은 전혀 건드리지 않음 — 기존 에러 문구/동작 그대로 유지.

## 검증 방법
1. 한 부문의 조별리그를 마지막 한 경기만 남기고 모두 확정.
2. 마지막 경기를 한 팀이 제출, 상대 팀이 확인(`confirmMatchScore`)하여 확정.
3. `/admin/standings`에서 버튼 클릭 없이 해당 부문의 "토너먼트 대진이 생성되었습니다" 상태로 바뀌는지 확인.
4. `/admin/matches`에서 `stage: knockout` 경기가 새로 생겼는지 확인.
5. 진출한 두 팀의 `/team/[teamId]` 화면에서 "토너먼트" 섹션이 나타나는지 확인(최대 6초 폴링 대기 또는 새로고침).
6. 진출하지 못한 팀 화면에는 토너먼트 섹션이 나타나지 않는지 확인.
7. 이미 생성된 부문에서 관리자가 수동 "토너먼트 대진 생성" 버튼을 눌러도 기존과 동일하게 "이미 생성되어 있습니다" 에러가 뜨는지 확인 (기존 동작 보존).
8. `npm run build`로 타입 에러 없는지 확인.

### 수정/생성 파일
- `lib/bracket/autoGenerateKnockout.ts` (신규)
- `app/actions/participant.ts` (`confirmMatchScore`에 트리거 추가)
- `app/actions/admin.ts` (`resolveMatchDispute`, `overrideMatchScore`에 트리거 추가)
