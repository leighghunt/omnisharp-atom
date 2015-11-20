import {join} from "path";
import {readFileSync} from "fs";
import {CompositeDisposable} from "rx";

module.exports = function(
    {testPaths, buildAtomEnvironment, buildDefaultApplicationDelegate}: {
        testPaths: string[];
        buildAtomEnvironment: (opts: any) => Atom.Atom;
        applicationDelegate: any;
        window: Window;
        document: Document;
        enablePersistence: boolean;
        buildDefaultApplicationDelegate: any;
        logFile: string;
        headless: boolean
    }): Promise<number> {
    console.log(testPaths);
    const fixtures = testPaths.map(x => join(x, "fixtures"));

    const applicationDelegate = buildDefaultApplicationDelegate();

    applicationDelegate.setRepresentedFilename = () => {/* */ };
    applicationDelegate.setWindowDocumentEdited = () => {/* */ };

    const mochaCtor: typeof Mocha = require("mocha");
    const globby: (paths: string[]) => Promise<string[]> = require("globby");

    const atom = buildAtomEnvironment({
        applicationDelegate: applicationDelegate,
        window, document,
        configDirPath: process.env.ATOM_HOME,
        enablePersistence: false
    });

    (document as any).atom = atom;
    (window as any).atom = atom;
    (global as any).atom = atom;

    //const atomDiv = document.createElement("div");
    //atomDiv.style.display = "none";
    //document.body.appendChild(atomDiv);
    //atomDiv.appendChild(atom.views.getView(atom.workspace));

    const mochaDiv = document.createElement("div");
    mochaDiv.id = "mocha";
    document.body.appendChild(mochaDiv);

    const mochaCss = document.createElement("style");
    mochaCss.innerHTML = `html, body { overflow: inherit; }\n` + readFileSync(join(__dirname, "..", "node_modules", "mocha", "mocha.css")).toString();
    document.head.appendChild(mochaCss);

    const mocha = new mochaCtor({
        ui: "bdd",
        reporter: "html",
        grep: "format",
        timeout: 30000
    });

    let cd: CompositeDisposable;

    /* tslint:disable:variable-name */
    const {SolutionManager} = require("../lib/omni-sharp-server/solution-manager");
    /* tslint:enable:variable-name */

    (<any>mocha).suite.beforeEach(() => {
        cd = new CompositeDisposable();

        cd.add(SolutionManager.solutionObserver.errors.subscribe((error: any) => console.error(JSON.stringify(error))));
        cd.add(SolutionManager.solutionObserver.events.subscribe((event: any) => console.info(`server event: ${JSON.stringify(event)}`)));
        cd.add(SolutionManager.solutionObserver.requests.subscribe((r: any) => console.info(`request: ${JSON.stringify(r)}`)));
        cd.add(SolutionManager.solutionObserver.responses.subscribe((r: any) => console.info(`response: ${JSON.stringify(r)}`)));

        process.chdir(fixtures[0]);
        atom.project.setPaths(<any>fixtures);
    });

    (<any>mocha).suite.afterEach(() => {
        cd.dispose();
        atom.packages.deactivatePackages();
    });

    return Promise.all(testPaths.map(path => globby([join(path, "**/*-spec.js")])))
        .then((paths) => {
            paths.forEach(fs => fs.forEach(f => mocha.addFile(f)));

            return new Promise<number>(resolve => mocha.run(resolve));
        });
};
