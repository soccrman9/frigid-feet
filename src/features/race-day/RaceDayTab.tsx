import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Award, ArrowLeft, Timer } from 'lucide-react';
import type { Leg, LegStatus } from '../../types/domain';
import { useEventData, type LegMutationActionType } from '../../state/EventDataContext';
import { BadgesSubView } from '../badges/BadgesSubView';
import { LegEditorDialog, type LegEditorSavePayload } from './LegEditorDialog';
import {
  RaceDayToasts,
  type MilestoneToastState,
  type UndoToastState,
} from './RaceDayToasts';
import {
  buildMilestoneToastMessage,
  generateMutationId,
  getActiveRoundNumber,
  getPrimaryCourse,
  getThumbDockState,
} from './raceDayUtils';
import { RoundLineup } from './RoundLineup';
import { RoundPillRail } from './RoundPillRail';
import { StartRoundSheet } from './StartRoundSheet';
import { TeamProgressList } from './TeamProgressList';
import { ThumbActionDock } from './ThumbActionDock';

export type RaceDaySubView = 'timeline' | 'badges' | 'speed-board';

export interface RaceDayTabProps {
  /** Clean mount point for Ticket 25 Organizer "Start Round N" action in the Round header. */
  renderRoundHeaderAction?: (roundNumber: number) => ReactNode;
  /** Clean mount point for Ticket 26 Live Auto-Badges & Organizer Superlatives sub-view. */
  renderBadgesView?: () => ReactNode;
  /** Clean mount point for Ticket 27 Opt-in Speed Leaderboard sub-view. */
  renderSpeedBoardView?: () => ReactNode;
  /** Clean mount point for Ticket 27 Event Recap navigation from the All-Done Thumb Dock CTA. */
  onOpenEventRecap?: () => void;
}

const SUB_TABS: ReadonlyArray<{ id: RaceDaySubView; label: string }> = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'badges', label: 'Badges' },
  { id: 'speed-board', label: 'Speed Board' },
];

export function RaceDayTab({
  renderRoundHeaderAction,
  renderBadgesView,
  renderSpeedBoardView,
  onOpenEventRecap,
}: RaceDayTabProps = {}) {
  const {
    eventApi,
    eventId,
    snapshot,
    isOrganizer,
    isOnline,
    activeParticipant,
    setHeaderRoundSlot,
    refreshSnapshot,
    submitLegMutation,
  } = useEventData();

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [subView, setSubView] = useState<RaceDaySubView>('timeline');
  const [showInlineRecap, setShowInlineRecap] = useState(false);

  const activeRoundNumber = useMemo(
    () => getActiveRoundNumber(snapshot.rounds, snapshot.legs, nowMs),
    [snapshot.rounds, snapshot.legs, nowMs],
  );

  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number>(() =>
    getActiveRoundNumber(snapshot.rounds, snapshot.legs, Date.now()),
  );
  const [editingLegId, setEditingLegId] = useState<string | null>(null);
  const [editingLegInitialStatus, setEditingLegInitialStatus] = useState<LegStatus | undefined>(
    undefined,
  );
  const [startRoundOpen, setStartRoundOpen] = useState(false);
  const [busyLegId, setBusyLegId] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const [milestoneToast, setMilestoneToast] = useState<MilestoneToastState | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);

  const completedLegsCount = useMemo(
    () => snapshot.legs.filter((leg) => leg.status === 'completed').length,
    [snapshot.legs],
  );
  const prevCompletedCountRef = useRef<number>(completedLegsCount);

  // Live 1-second timer tick for smooth tabular elapsed & countdown telemetry
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Push active Round badge (R1-R10) into AppShell's slim 48px header slot
  useEffect(() => {
    setHeaderRoundSlot(
      <span
        data-testid="header-round-badge"
        className="font-telemetry shrink-0 rounded px-1.5 py-0.5 text-xs font-bold"
        style={{
          backgroundColor: 'var(--shell-dock)',
          color: 'var(--accent-glacier)',
          border: '1px solid var(--border-strong)',
        }}
      >
        R{activeRoundNumber}
      </span>,
    );
    return () => {
      setHeaderRoundSlot(null);
    };
  }, [activeRoundNumber, setHeaderRoundSlot]);

  // Detect external/remote Leg completions to surface collective milestone toasts
  useEffect(() => {
    const prev = prevCompletedCountRef.current;
    prevCompletedCountRef.current = completedLegsCount;
    if (completedLegsCount > prev && !milestoneToast) {
      const msg = buildMilestoneToastMessage(prev, completedLegsCount, null, null, 0);
      if (msg) {
        setMilestoneToast({ id: generateMutationId(), message: msg });
      }
    }
  }, [completedLegsCount, milestoneToast]);

  const primaryCourse = useMemo(() => getPrimaryCourse(snapshot.courses), [snapshot.courses]);

  const selectedRound = useMemo(
    () => snapshot.rounds.find((r) => r.roundNumber === selectedRoundNumber) ?? null,
    [snapshot.rounds, selectedRoundNumber],
  );

  const dockState = useMemo(
    () =>
      getThumbDockState({
        activeParticipant,
        legs: snapshot.legs,
        rounds: snapshot.rounds,
        courses: snapshot.courses,
        nowMs,
      }),
    [activeParticipant, snapshot.legs, snapshot.rounds, snapshot.courses, nowMs],
  );

  const editingLeg = useMemo(
    () => (editingLegId ? (snapshot.legs.find((l) => l.id === editingLegId) ?? null) : null),
    [editingLegId, snapshot.legs],
  );

  const runLegMutation = useCallback(
    async ({
      leg,
      actionType,
      status,
      startedAt,
      finishedAt,
      durationSeconds,
      courseId,
      externalActivityUrl,
      isExplicitRevert,
      undoMessage,
    }: {
      leg: Leg;
      actionType: LegMutationActionType;
      status: Leg['status'];
      startedAt: string | null;
      finishedAt: string | null;
      durationSeconds: number | null;
      courseId: string | null;
      externalActivityUrl: string | null;
      isExplicitRevert: boolean;
      undoMessage?: string;
    }) => {
      setBusyLegId(leg.id);
      const previousLegSnapshot: Leg = { ...leg };
      const prevTotalCompleted = snapshot.legs.filter((l) => l.status === 'completed').length;

      try {
        const { result } = await submitLegMutation(
          {
            eventId,
            legId: leg.id,
            mutationId: generateMutationId(),
            status,
            startedAt,
            finishedAt,
            durationSeconds,
            courseId: courseId ?? primaryCourse?.id ?? null,
            externalActivityUrl,
            isExplicitRevert,
            clientUpdatedAt: new Date(Date.now()).toISOString(),
          },
          { actionType, previousLegSnapshot },
        );

        if (!result.applied && result.reason === 'stale_or_overridden') {
          setStatusNotice('Updated to latest Basecamp status');
          return;
        }

        if (undoMessage) {
          setUndoToast({
            id: generateMutationId(),
            message: undoMessage,
            previousLegSnapshot,
          });
        }

        // Queue collective distance celebration on newly completed Leg
        if (previousLegSnapshot.status !== 'completed' && result.leg.status === 'completed') {
          const nextTotalCompleted = prevTotalCompleted + 1;
          prevCompletedCountRef.current = nextTotalCompleted;
          const runner = snapshot.participants.find((p) => p.id === leg.runnerId) ?? null;
          const team = snapshot.teams.find((t) => t.id === leg.teamId) ?? null;
          const teamCompletedAfter =
            snapshot.legs.filter((l) => l.teamId === leg.teamId && l.status === 'completed')
              .length + 1;
          const milestoneMsg = buildMilestoneToastMessage(
            prevTotalCompleted,
            nextTotalCompleted,
            runner?.displayName ?? null,
            team?.name ?? null,
            teamCompletedAfter,
          );
          if (milestoneMsg) {
            setMilestoneToast({ id: generateMutationId(), message: milestoneMsg });
          }
        }
      } finally {
        setBusyLegId(null);
      }
    },
    [eventId, primaryCourse?.id, snapshot.legs, snapshot.participants, snapshot.teams, submitLegMutation],
  );

  const handleStartLeg = useCallback(
    (leg: Leg) => {
      const nowIso = new Date(Date.now()).toISOString();
      const runner = snapshot.participants.find((p) => p.id === leg.runnerId);
      const label = runner ? `${runner.displayName} started Round ${leg.roundNumber}` : `Started Round ${leg.roundNumber} Leg`;
      void runLegMutation({
        leg,
        actionType: 'start',
        status: 'out_on_course',
        startedAt: nowIso,
        finishedAt: null,
        durationSeconds: null,
        courseId: leg.courseId ?? primaryCourse?.id ?? null,
        externalActivityUrl: leg.externalActivityUrl,
        isExplicitRevert: false,
        undoMessage: label,
      });
    },
    [primaryCourse?.id, runLegMutation, snapshot.participants],
  );

  const handleFinishLeg = useCallback(
    (leg: Leg) => {
      const finishedMs = Date.now();
      const finishedIso = new Date(finishedMs).toISOString();
      const startedMs = leg.startedAt ? Date.parse(leg.startedAt) : Number.NaN;
      const autoDurationSeconds = !Number.isNaN(startedMs)
        ? Math.max(1, Math.round((finishedMs - startedMs) / 1000))
        : null;
      const runner = snapshot.participants.find((p) => p.id === leg.runnerId);
      const label = runner ? `${runner.displayName} finished Round ${leg.roundNumber}` : `Finished Round ${leg.roundNumber} Leg`;

      void runLegMutation({
        leg,
        actionType: 'finish',
        status: 'completed',
        startedAt: leg.startedAt,
        finishedAt: finishedIso,
        durationSeconds: autoDurationSeconds,
        courseId: leg.courseId ?? primaryCourse?.id ?? null,
        externalActivityUrl: leg.externalActivityUrl,
        isExplicitRevert: false,
        undoMessage: label,
      });
    },
    [primaryCourse?.id, runLegMutation, snapshot.participants],
  );

  const handleSaveEditedLeg = useCallback(
    async (leg: Leg, payload: LegEditorSavePayload) => {
      const actionType: LegMutationActionType = payload.isExplicitRevert
        ? 'revert'
        : leg.status === 'scheduled' && payload.status === 'completed'
          ? 'mark_completed'
          : 'edit';

      await runLegMutation({
        leg,
        actionType,
        status: payload.status,
        startedAt: payload.startedAt,
        finishedAt: payload.finishedAt,
        durationSeconds: payload.durationSeconds,
        courseId: payload.courseId,
        externalActivityUrl: payload.externalActivityUrl,
        isExplicitRevert: payload.isExplicitRevert,
      });
      setEditingLegId(null);
      setEditingLegInitialStatus(undefined);
    },
    [runLegMutation],
  );

  const handleUndo = useCallback(
    async (toast: UndoToastState) => {
      setUndoing(true);
      const prev = toast.previousLegSnapshot;
      try {
        await submitLegMutation(
          {
            eventId,
            legId: prev.id,
            mutationId: generateMutationId(),
            status: prev.status,
            startedAt: prev.startedAt,
            finishedAt: prev.finishedAt,
            durationSeconds: prev.durationSeconds,
            courseId: prev.courseId,
            externalActivityUrl: prev.externalActivityUrl,
            isExplicitRevert: true,
            clientUpdatedAt: new Date(Date.now()).toISOString(),
          },
          { actionType: 'revert', previousLegSnapshot: prev },
        );
        // Cancel any queued milestone celebration since the Leg completion was reverted
        setMilestoneToast(null);
        setUndoToast(null);
      } finally {
        setUndoing(false);
      }
    },
    [eventId, submitLegMutation],
  );

  const handleStartRound = useCallback(
    async (roundNumber: number, excludeLegIds: string[], startedAt: string): Promise<number> => {
      const startedCount = await eventApi.startRound(
        eventId,
        roundNumber,
        excludeLegIds,
        startedAt,
      );
      await refreshSnapshot();
      // Mass-start has no bulk-undo; accidental single-Runner starts are reverted individually
      setUndoToast(null);
      setStatusNotice(
        startedCount > 0
          ? `Started Round ${roundNumber} for ${startedCount} ${startedCount === 1 ? 'Runner' : 'Runners'}`
          : `Recorded Round ${roundNumber} start`,
      );
      return startedCount;
    },
    [eventApi, eventId, refreshSnapshot],
  );

  const handleDismissUndo = useCallback(() => setUndoToast(null), []);
  const handleDismissMilestone = useCallback(() => setMilestoneToast(null), []);
  const handleDismissStatusNotice = useCallback(() => setStatusNotice(null), []);

  const handleViewRecap = useCallback(() => {
    if (onOpenEventRecap) {
      onOpenEventRecap();
    } else {
      setShowInlineRecap(true);
    }
  }, [onOpenEventRecap]);

  const showDock = subView === 'timeline' && !showInlineRecap && dockState.kind !== 'hidden';
  const totalEventKm = completedLegsCount * 5;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Accessible main heading for Race Day (keeps 48px header ultra-slim) */}
      <h1 className="sr-only">Race Day</h1>

      {/* 44px gloved-thumb segmented sub-view bar */}
      <div
        role="tablist"
        aria-label="Race Day views"
        className="grid h-[44px] shrink-0 grid-cols-3 gap-1.5 border-b px-2.5 py-1"
        style={{
          backgroundColor: 'var(--bg-rail)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {SUB_TABS.map((tab) => {
          const isSelected = subView === tab.id && !showInlineRecap;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                setShowInlineRecap(false);
                setSubView(tab.id);
              }}
              className="pfl-focus-ring flex h-full min-h-[36px] cursor-pointer items-center justify-center rounded-[5px] text-[13px] font-bold transition-colors"
              style={
                isSelected
                  ? {
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--ink-primary)',
                      border: '1.5px solid var(--shell-header)',
                    }
                  : {
                      backgroundColor: 'transparent',
                      color: 'var(--ink-muted)',
                      border: '1.5px solid transparent',
                    }
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Horizontally scrollable 10-Round pill rail (Timeline only) */}
      {subView === 'timeline' && !showInlineRecap && (
        <RoundPillRail
          rounds={snapshot.rounds}
          legs={snapshot.legs}
          activeRoundNumber={activeRoundNumber}
          selectedRoundNumber={selectedRoundNumber}
          onSelectRound={setSelectedRoundNumber}
        />
      )}

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-2.5 pb-6">
          {showInlineRecap ? (
            <section
              aria-label="Event Recap"
              className="rounded-[6px] border-[1.5px] p-4"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Award size={20} style={{ color: 'var(--accent-spruce)' }} aria-hidden="true" />
                  <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
                    Event Recap
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInlineRecap(false)}
                  className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-bold"
                  style={{
                    backgroundColor: 'var(--bg-rail-subtle)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Back to Timeline
                </button>
              </div>
              <p
                className="font-telemetry mt-3 text-2xl font-bold"
                style={{ color: 'var(--accent-spruce)' }}
              >
                {totalEventKm} km run together
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                {completedLegsCount} completed 5K {completedLegsCount === 1 ? 'Leg' : 'Legs'} across{' '}
                {snapshot.teams.length} {snapshot.teams.length === 1 ? 'Team' : 'Teams'}.
              </p>
              <div className="mt-3">
                <TeamProgressList teams={snapshot.teams} legs={snapshot.legs} />
              </div>
            </section>
          ) : subView === 'timeline' ? (
            <>
              <RoundLineup
                roundNumber={selectedRoundNumber}
                round={selectedRound}
                legs={snapshot.legs}
                participants={snapshot.participants}
                teams={snapshot.teams}
                courses={snapshot.courses}
                timezone={snapshot.event.timezone}
                activeParticipant={activeParticipant}
                isOrganizer={isOrganizer}
                nowMs={nowMs}
                busyLegId={busyLegId}
                headerAction={
                  renderRoundHeaderAction ? (
                    renderRoundHeaderAction(selectedRoundNumber)
                  ) : isOrganizer ? (
                    <StartRoundSheet
                      roundNumber={selectedRoundNumber}
                      round={selectedRound}
                      legs={snapshot.legs}
                      participants={snapshot.participants}
                      teams={snapshot.teams}
                      courses={snapshot.courses}
                      timezone={snapshot.event.timezone}
                      isOnline={isOnline}
                      onOpenChange={setStartRoundOpen}
                      onStartRound={handleStartRound}
                    />
                  ) : undefined
                }
                onStartLeg={handleStartLeg}
                onFinishLeg={handleFinishLeg}
                onEditLeg={(leg, initialStatus) => {
                  setEditingLegInitialStatus(initialStatus);
                  setEditingLegId(leg.id);
                }}
              />

              <TeamProgressList teams={snapshot.teams} legs={snapshot.legs} />
            </>
          ) : subView === 'badges' ? (
            renderBadgesView ? (
              renderBadgesView()
            ) : (
              <BadgesSubView />
            )
          ) : renderSpeedBoardView ? (
            renderSpeedBoardView()
          ) : (
            <section
              aria-label="Speed Board"
              className="rounded-[6px] border-[1.5px] p-4"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
              }}
            >
              <div className="flex items-center gap-2">
                <Timer size={18} style={{ color: 'var(--ink-secondary)' }} aria-hidden="true" />
                <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
                  Speed Board
                </h2>
              </div>
              <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                Opt-in individual 5K Leaderboard — only Runners who turn on Speed Leaderboard in
                their Home profile appear here.
              </p>
            </section>
          )}
        </div>
      </div>

      {/* High-vis dark polar-navy sticky bottom thumb-zone action dock */}
      {subView === 'timeline' && !showInlineRecap && (
        <ThumbActionDock
          dockState={dockState}
          busy={busyLegId !== null}
          onStartLeg={handleStartLeg}
          onFinishLeg={handleFinishLeg}
          onViewRecap={handleViewRecap}
        />
      )}

      {/* Accessible popover="manual" Undo & collective milestone toasts */}
      <RaceDayToasts
        undoToast={undoToast}
        milestoneToast={milestoneToast}
        statusNotice={statusNotice}
        hasThumbDock={showDock}
        modalOpen={editingLeg !== null || startRoundOpen}
        undoing={undoing}
        onUndo={(toast) => void handleUndo(toast)}
        onDismissUndo={handleDismissUndo}
        onDismissMilestone={handleDismissMilestone}
        onDismissStatusNotice={handleDismissStatusNotice}
      />

      {/* Native <dialog> Leg Editor (Course, watch time / blank, https:// activity link, Mark Completed / Revert) */}
      <LegEditorDialog
        leg={editingLeg}
        initialStatus={editingLegInitialStatus}
        runner={
          editingLeg?.runnerId
            ? (snapshot.participants.find((p) => p.id === editingLeg.runnerId) ?? null)
            : null
        }
        team={
          editingLeg
            ? (snapshot.teams.find((t) => t.id === editingLeg.teamId) ?? null)
            : null
        }
        courses={snapshot.courses}
        nowMs={nowMs}
        saving={editingLeg !== null && busyLegId === editingLeg.id}
        onClose={() => {
          setEditingLegId(null);
          setEditingLegInitialStatus(undefined);
        }}
        onSave={handleSaveEditedLeg}
      />
    </div>
  );
}
