import { mount } from 'svelte';
import App from './App.svelte';
import { requestPersistentStorage, restoreKeyflowPreferences } from './lib/preferences';
import './style.css';

restoreKeyflowPreferences();
void requestPersistentStorage().then((persisted) => {
  document.documentElement.dataset.storage = persisted ? 'persistent' : 'best-effort';
});
mount(App, { target: document.getElementById('app')! });
