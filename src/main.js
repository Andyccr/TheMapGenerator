/**
 * Fantasy World Map Generator
 * Entry point — static ES modules, no bundler required (GitHub Pages can serve this as-is).
 */
import { App } from "./ui/app.js";

const app = new App(document);
app.start();
