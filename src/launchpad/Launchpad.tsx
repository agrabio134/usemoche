import { Buffer } from 'buffer';
(globalThis as any).Buffer ??= Buffer;
import App from './app/App';
import './launchpad.css';

/** Client-only island mounted on /launchpad. */
export default function Launchpad() {
  return <App />;
}
