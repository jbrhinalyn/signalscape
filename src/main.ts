import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';

bootstrapApplication(App).catch((error: unknown) => {
  console.error('SignalScape renderer startup failed:', error);
});
