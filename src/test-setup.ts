import { timeZoneDefaults } from './app/core/time-zone/time-zone.service';

// Specs write their dates in UTC; the app's own default is La Paz.
timeZoneDefaults.zone = 'UTC';
