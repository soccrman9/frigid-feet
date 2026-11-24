import { useMemo, useState } from 'react';
import { Award, ChevronRight } from 'lucide-react';
import { useEventData } from '../../state/EventDataContext';
import { ChipInProgressCard } from '../chip-in/ChipInProgressCard';
import { OrganizerModePanel } from '../organizer/OrganizerModePanel';
import { ParticipantProfileCard } from '../participant/ParticipantProfileCard';
import { EventRecapView } from '../recap/EventRecapView';
import { formatRecapKm } from '../recap/recapFormatters';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { CoursesSection } from './CoursesSection';
import { computeCollectiveStats, EventInfoSection } from './EventInfoSection';

export interface HomeTabProps {
  onOpenEventRecap?: () => void;
}

export function HomeTab({ onOpenEventRecap }: HomeTabProps = {}) {
  const { snapshot } = useEventData();
  const [showInlineRecap, setShowInlineRecap] = useState(false);
  const { event, rounds, courses, announcements, legs, teams, chipInTotalCents } = snapshot;

  const { completedLegsCount, totalKm } = useMemo(
    () => computeCollectiveStats(legs, courses),
    [legs, courses],
  );

  if (showInlineRecap) {
    return (
      <EventRecapView
        onBack={() => setShowInlineRecap(false)}
        backLabel="Back to Home"
      />
    );
  }

  const handleOpenRecap = () => {
    if (onOpenEventRecap) {
      onOpenEventRecap();
    } else {
      setShowInlineRecap(true);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 pb-6">
      <ParticipantProfileCard />

      <EventInfoSection
        event={event}
        rounds={rounds}
        legs={legs}
        courses={courses}
        teams={teams}
      />

      <AnnouncementsFeed announcements={announcements} timezone={event.timezone} />

      <CoursesSection courses={courses} basecampName={event.basecampName} />

      <ChipInProgressCard event={event} chipInTotalCents={chipInTotalCents} />

      {/* Celebratory Event Recap Entry Card */}
      <section
        data-testid="home-event-recap-card"
        aria-labelledby="home-event-recap-heading"
        className="overflow-hidden rounded-md border-[1.5px] p-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              id="home-event-recap-heading"
              className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--accent-spruce)' }}
            >
              <Award size={15} strokeWidth={2.25} aria-hidden="true" />
              <span>Event Recap &amp; Summaries</span>
            </p>
            <p className="mt-1 text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
              {completedLegsCount > 0
                ? `${formatRecapKm(totalKm)} together across ${completedLegsCount} ${
                    completedLegsCount === 1 ? 'Leg' : 'Legs'
                  }`
                : 'Celebrate together & copy shareable summaries'}
            </p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              View Team 50K completions, live Badges &amp; Organizer superlatives, and copy your
              summary for group chat or Strava.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenRecap}
          className="pfl-focus-ring mt-3 flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-4 text-sm font-bold transition-opacity hover:opacity-95"
          style={{
            backgroundColor: 'var(--shell-header)',
            color: 'var(--ink-on-shell)',
          }}
        >
          <span>View Event Recap</span>
          <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </section>

      <OrganizerModePanel />
    </div>
  );
}
