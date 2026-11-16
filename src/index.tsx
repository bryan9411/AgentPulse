import {runDiffPopup, runHelpPopup} from './app/runPopups.tsx';
import {runSidebar} from './app/runSidebar.tsx';
import {launch} from './bootstrap/launcher.ts';

const args = process.argv.slice(2);

if (args.includes('--role=sidebar')) {
	runSidebar();
} else if (args.includes('--role=diff')) {
	process.exit(await runDiffPopup(args));
} else if (args.includes('--role=help')) {
	process.exit(await runHelpPopup(args));
} else {
	// --restart-ui 會重建 UI server（例如更新後），背景 AI 工作階段不受影響
	process.exit(await launch({restartUi: args.includes('--restart-ui')}));
}
