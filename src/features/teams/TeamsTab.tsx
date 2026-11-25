import { useEffect, useMemo, useState } from 'react';
import { HeartHandshake, Info, Plus, Users } from 'lucide-react';
import type { Leg } from '../../types/domain';
import { useEventData } from '../../state/EventDataContext';
import { getRsvpOption } from '../participant/participantConstants';
import { FreeAgentsList } from './FreeAgentsList';
import { RoundScheduleBuilder } from './RoundScheduleBuilder';
import { TeamCard } from './TeamCard';
import { TeamCreateForm, type TeamFormValues } from './TeamCreateForm';
import { getFreeAgents, sortTeamsAlphabetically } from './teamScheduleWarnings';

export function TeamsTab() {
  const {
    eventApi,
    eventId,
    snapshot,
    isOrganizer,
    isOnline,
    activeParticipant,
    refreshSnapshot,
    setSnapshot,
  } = useEventData();

  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmingLeaveTeamId, setConfirmingLeaveTeamId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const sortedTeams = useMemo(() => sortTeamsAlphabetically(snapshot.teams), [snapshot.teams]);
  const freeAgents = useMemo(
    () => getFreeAgents(snapshot.participants),
    [snapshot.participants],
  );

  const membersByTeamId = useMemo(() => {
    const map = new Map<string, typeof snapshot.participants>();
    for (const participant of snapshot.participants) {
      if (!participant.teamId) continue;
      const list = map.get(participant.teamId) ?? [];
      list.push(participant);
      map.set(participant.teamId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
      );
    }
    return map;
  }, [snapshot.participants]);

  const selectedTeam = useMemo(
    () => (selectedTeamId ? snapshot.teams.find((t) => t.id === selectedTeamId) ?? null : null),
    [selectedTeamId, snapshot.teams],
  );

  // If the selected Team was auto-deleted (e.g. after leave_team), return cleanly to overview
  useEffect(() => {
    if (selectedTeamId && !selectedTeam) {
      setSelectedTeamId(null);
    }
  }, [selectedTeamId, selectedTeam]);

  const isGoingRunner = activeParticipant?.rsvpStatus === 'going_runner';
  const isFreeAgent = Boolean(isGoingRunner && activeParticipant?.teamId === null);
  const isRunnerOnTeam = Boolean(isGoingRunner && activeParticipant?.teamId !== null);
  const canCreateTeam = isFreeAgent || isOrganizer;

  async function handleCreateTeam(values: TeamFormValues) {
    if (!canCreateTeam) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to create a Team.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const created = await eventApi.createTeam(eventId, {
        name: values.name,
        tagline: values.tagline,
        colorHex: values.colorHex,
        emoji: values.emoji,
        isOpen: values.isOpen,
        lookingNote: values.lookingNote,
      });

      if (isOrganizer) {
        const selectedIds = values.initialRunnerIds ?? [];
        for (const runnerId of selectedIds) {
          await eventApi.updateParticipant(eventId, runnerId, { teamId: created.id });
        }
      } else if (isFreeAgent && activeParticipant) {
        await eventApi.updateParticipant(eventId, activeParticipant.id, {
          teamId: created.id,
        });
      }

      await refreshSnapshot();
      setShowCreateForm(false);
      const addedCount = isOrganizer ? (values.initialRunnerIds?.length ?? 0) : 0;
      setStatusMessage(
        addedCount > 0
          ? `Created Team "${created.name}" with ${addedCount} ${addedCount === 1 ? 'Runner' : 'Runners'} and 10 Rounds ready to schedule.`
          : `Created Team "${created.name}" with 10 Rounds ready to schedule.`,
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not create Team.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateTeam(teamId: string, values: TeamFormValues) {
    if (!isOnline) {
      setErrorMessage('Requires connection to update Team details.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await eventApi.updateTeam(eventId, teamId, {
        name: values.name,
        tagline: values.tagline,
        colorHex: values.colorHex,
        emoji: values.emoji,
        isOpen: values.isOpen,
        lookingNote: values.lookingNote,
      });
      setSnapshot((prev) => ({
        ...prev,
        teams: prev.teams.map((t) => (t.id === updated.id ? updated : t)),
      }));
      setStatusMessage(`Saved settings for "${updated.name}".`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not update Team.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinTeam(teamId: string) {
    if (!activeParticipant || !isFreeAgent) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to join a Team.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await eventApi.updateParticipant(eventId, activeParticipant.id, { teamId });
      await refreshSnapshot();
      const joinedTeam = snapshot.teams.find((t) => t.id === teamId);
      setStatusMessage(joinedTeam ? `Joined ${joinedTeam.name}.` : 'Joined Team.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not join Team.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmLeaveTeam() {
    if (!activeParticipant) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to leave a Team.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await eventApi.leaveTeam(activeParticipant.id);
      await refreshSnapshot();
      setConfirmingLeaveTeamId(null);
      setSelectedTeamId(null);
      setStatusMessage('Left Team — you are back in Free Agents.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not leave Team.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOrganizerAssign(participantId: string, teamId: string) {
    if (!isOrganizer) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to assign a Runner.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await eventApi.updateParticipant(eventId, participantId, { teamId });
      await refreshSnapshot();
      const runnerName =
        snapshot.participants.find((p) => p.id === participantId)?.displayName ?? 'Runner';
      const teamName = snapshot.teams.find((t) => t.id === teamId)?.name ?? 'Team';
      setStatusMessage(`Assigned ${runnerName} to ${teamName}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not assign Runner.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOrganizerMoveRunner(participantId: string, targetTeamId: string | null) {
    if (!isOrganizer) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to move a Runner.');
      return;
    }
    const participant = snapshot.participants.find((p) => p.id === participantId);
    if (!participant || participant.teamId === targetTeamId) return;

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      // Use leaveTeam semantics first so old 'scheduled' Legs are unassigned while
      // 'completed' and 'out_on_course' Legs stay preserved (and empty old Teams clean up).
      await eventApi.leaveTeam(participantId);
      if (targetTeamId) {
        await eventApi.updateParticipant(eventId, participantId, { teamId: targetTeamId });
      }
      await refreshSnapshot();
      const targetTeamName = targetTeamId
        ? (snapshot.teams.find((t) => t.id === targetTeamId)?.name ?? 'Team')
        : null;
      setStatusMessage(
        targetTeamName
          ? `Moved ${participant.displayName} to ${targetTeamName}.`
          : `Moved ${participant.displayName} back to Free Agents.`,
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not move Runner.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateLeg(
    legId: string,
    patch: { runnerId?: string | null; courseId?: string | null },
  ) {
    if (!isOnline) {
      setErrorMessage('Requires connection to edit the Round schedule.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const updated = await eventApi.updateLeg(eventId, legId, patch);
      setSnapshot((prev) => ({
        ...prev,
        legs: prev.legs.map((l) => (l.id === updated.id ? updated : l)),
      }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not update Round assignment.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSwapLegs(legA: Leg, legB: Leg) {
    if (!isOnline) {
      setErrorMessage('Requires connection to swap Rounds.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const [updatedA, updatedB] = await Promise.all([
        eventApi.updateLeg(eventId, legA.id, { runnerId: legB.runnerId }),
        eventApi.updateLeg(eventId, legB.id, { runnerId: legA.runnerId }),
      ]);
      setSnapshot((prev) => ({
        ...prev,
        legs: prev.legs.map((l) => {
          if (l.id === updatedA.id) return updatedA;
          if (l.id === updatedB.id) return updatedB;
          return l;
        }),
      }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not swap Rounds.');
    } finally {
      setBusy(false);
    }
  }

  if (selectedTeam) {
    const teamLegs = snapshot.legs.filter((l) => l.teamId === selectedTeam.id);
    const teamMembers = membersByTeamId.get(selectedTeam.id) ?? [];

    return (
      <RoundScheduleBuilder
        team={selectedTeam}
        teamMembers={teamMembers}
        allParticipants={snapshot.participants}
        teamLegs={teamLegs}
        rounds={snapshot.rounds}
        courses={snapshot.courses}
        timezone={snapshot.event.timezone}
        activeParticipant={activeParticipant}
        isOrganizer={isOrganizer}
        isOnline={isOnline}
        busy={busy}
        onBack={() => {
          setSelectedTeamId(null);
          setErrorMessage(null);
        }}
        onJoinTeam={(id) => void handleJoinTeam(id)}
        onLeaveTeam={handleConfirmLeaveTeam}
        onUpdateTeam={handleUpdateTeam}
        onUpdateLeg={handleUpdateLeg}
        onSwapLegs={handleSwapLegs}
      />
    );
  }

  const rsvpOption = activeParticipant ? getRsvpOption(activeParticipant.rsvpStatus) : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 pb-6">
      {/* Header summary card */}
      <section
        className="rounded-md border-[1.5px] p-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p
              className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              <Users size={14} strokeWidth={2.3} aria-hidden="true" />
              <span>Relay Rosters &amp; 10-Round Schedules</span>
            </p>
            <h1 className="mt-0.5 text-xl font-bold" style={{ color: 'var(--ink-primary)' }}>
              Teams
            </h1>
            <p className="mt-1 text-sm font-medium tabular-nums" style={{ color: 'var(--ink-muted)' }}>
              {sortedTeams.length} {sortedTeams.length === 1 ? 'Team' : 'Teams'} ·{' '}
              {freeAgents.length} Free {freeAgents.length === 1 ? 'Agent' : 'Agents'}
            </p>
          </div>

          {canCreateTeam && (
            <button
              type="button"
              disabled={!isOnline || busy}
              onClick={() => {
                setShowCreateForm((prev) => !prev);
                setErrorMessage(null);
                setStatusMessage(null);
              }}
              aria-expanded={showCreateForm}
              className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border-0 px-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
              style={{
                backgroundColor: 'var(--accent-amber-cta)',
                color: '#0C1E30',
              }}
            >
              <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
              <span>
                {!isOnline
                  ? 'Requires connection'
                  : showCreateForm
                    ? 'Close Form'
                    : 'Create a Team'}
              </span>
            </button>
          )}
        </div>

        {/* Welcoming explanatory copy for Supporters and other RSVP statuses */}
        {activeParticipant && !isGoingRunner && (
          <div
            className="mt-3 flex items-start gap-2.5 rounded-md border p-3 text-sm"
            style={{
              backgroundColor: 'var(--bg-rail-subtle)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            {activeParticipant.rsvpStatus === 'going_supporter' ? (
              <HeartHandshake
                size={18}
                strokeWidth={2.2}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--shell-header)' }}
              />
            ) : (
              <Info
                size={18}
                strokeWidth={2.2}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--shell-header)' }}
              />
            )}
            <div className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>
                You&apos;re RSVP&apos;d as {rsvpOption?.label}
              </p>
              <p className="mt-0.5">
                {activeParticipant.rsvpStatus === 'going_supporter'
                  ? 'Thank you for cheering and helping at Basecamp! Teams are for Runners covering 5K Legs. You can browse every Team schedule below, or switch your RSVP to Going (Runner) on the Home tab anytime if you want to jump in for a Leg.'
                  : 'Teams are for Runners RSVP’d as Going (Runner). You can browse every Team schedule below, and update your RSVP to Going (Runner) on the Home tab whenever you’re ready to join or create a Team.'}
              </p>
            </div>
          </div>
        )}

        {statusMessage && (
          <div
            role="status"
            className="mt-3 rounded-md border px-3 py-2 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--accent-spruce-soft)',
              borderColor: 'var(--accent-spruce)',
              color: 'var(--accent-spruce)',
            }}
          >
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mt-3 rounded-md border px-3 py-2 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--accent-error-bg)',
              borderColor: 'var(--accent-error-border)',
              color: 'var(--accent-error)',
            }}
          >
            {errorMessage}
          </div>
        )}
      </section>

      {showCreateForm && canCreateTeam && (
        <TeamCreateForm
          mode="create"
          willAutoJoinCreator={!isOrganizer && isFreeAgent}
          isOrganizer={isOrganizer}
          freeAgents={freeAgents}
          isOnline={isOnline}
          busy={busy}
          onSubmit={handleCreateTeam}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Alphabetical Relay Teams list */}
      <section aria-label="Relay Teams" className="flex flex-col gap-2.5">
        <p
          className="px-0.5 text-xs font-bold tracking-wider uppercase"
          style={{ color: 'var(--ink-secondary)' }}
        >
          Alphabetical Roster (A–Z)
        </p>

        {sortedTeams.length === 0 ? (
          <div
            className="rounded-md border-[1.5px] p-4 text-sm"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-muted)',
            }}
          >
            No Teams yet — start the first Team above with zero invite codes!
          </div>
        ) : (
          sortedTeams.map((team) => {
            const members = membersByTeamId.get(team.id) ?? [];
            const isParticipantTeam = activeParticipant?.teamId === team.id;
            return (
              <TeamCard
                key={team.id}
                team={team}
                teamMembers={members}
                allTeams={sortedTeams}
                legs={snapshot.legs}
                isParticipantTeam={isParticipantTeam}
                isOrganizer={isOrganizer}
                canJoin={isFreeAgent}
                isRunnerOnAnotherTeam={isRunnerOnTeam && !isParticipantTeam}
                isOnline={isOnline}
                busy={busy}
                confirmingLeave={confirmingLeaveTeamId === team.id}
                onOpenSchedule={(id) => {
                  setSelectedTeamId(id);
                  setConfirmingLeaveTeamId(null);
                  setShowCreateForm(false);
                }}
                onJoinTeam={(id) => void handleJoinTeam(id)}
                onRequestLeave={(id) => setConfirmingLeaveTeamId(id)}
                onConfirmLeave={() => void handleConfirmLeaveTeam()}
                onCancelLeave={() => setConfirmingLeaveTeamId(null)}
                onOrganizerMoveRunner={(participantId, targetTeamId) =>
                  void handleOrganizerMoveRunner(participantId, targetTeamId)
                }
              />
            );
          })
        )}
      </section>

      {/* Free Agents section */}
      <FreeAgentsList
        freeAgents={freeAgents}
        activeParticipantId={activeParticipant?.id ?? null}
        teams={sortedTeams}
        isOrganizer={isOrganizer}
        isOnline={isOnline}
        busy={busy}
        onOrganizerAssignToTeam={(participantId, teamId) =>
          void handleOrganizerAssign(participantId, teamId)
        }
      />
    </div>
  );
}
