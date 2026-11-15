import {runSidebar} from './app/runSidebar.tsx';
import {launch} from './bootstrap/launcher.ts';

const args = process.argv.slice(2);

if (args.includes('--role=sidebar')) {
	runSidebar();
} else {
	// --restart-ui rebuilds the UI server (e.g. after an update); AI sessions are untouched.
	process.exit(await launch({restartUi: args.includes('--restart-ui')}));
}
