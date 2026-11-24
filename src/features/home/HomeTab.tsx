import { useEventData } from '../../state/EventDataContext';
import { OrganizerModePanel } from '../organizer/OrganizerModePanel';
import { ParticipantProfileCard } from '../participant/ParticipantProfileCard';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { CoursesSection } from './CoursesSection';
import { EventInfoSection } from './EventInfoSection';

export function HomeTab() {
  const { snapshot } = useEventData();
  const { event, rounds, courses, announcements, legs, teams } = snapshot;

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

      <OrganizerModePanel />
    </div>
  );
}
