import express from "express";
import { createApp, createServices } from "./apps/web/src/server";

const app = createApp(createServices());

export default app as express.Express;
