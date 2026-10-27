import { Provider } from '@angular/core';
import { DEFAULT_SETTINGS } from '../../core/models/notification';
import { MentorNotesService } from '../notes/mentor-notes.service';
import { NotificationService } from './notification.service';

/**
 * For specs of pages that show mentors' notes or send notifications: services that read and
 * write nothing. Wrap a method in `vi.fn` to check a call.
 */
export function quietNotifications() {
  const notifications = {
    notifyActivity: async (..._args: unknown[]) => 0,
    notifyStudents: async (..._args: unknown[]) => 0,
    listen:
      (..._args: unknown[]) =>
      () =>
        undefined,
    markRead: async (..._args: unknown[]) => undefined,
    settings: async (..._args: unknown[]) => ({ ...DEFAULT_SETTINGS }),
    saveSettings: async (..._args: unknown[]) => undefined,
  };
  const notes = {
    forTarget: async (..._args: unknown[]) => [],
    access: async (..._args: unknown[]) => ({ canWrite: false, mentorshipId: null }),
    add: async (..._args: unknown[]) => 'n1',
    edit: async (..._args: unknown[]) => undefined,
    remove: async (..._args: unknown[]) => undefined,
  };
  const providers: Provider[] = [
    { provide: NotificationService, useValue: notifications },
    { provide: MentorNotesService, useValue: notes },
  ];
  return { notifications, notes, providers };
}
