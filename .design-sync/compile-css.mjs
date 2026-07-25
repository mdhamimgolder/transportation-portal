import postcss from "postcss";
import tailwindPostcss from "@tailwindcss/postcss";
import { readFileSync, writeFileSync } from "fs";

const input = readFileSync("./app/globals.css", "utf8");
const result = await postcss([tailwindPostcss()]).process(input, {
  from: "./app/globals.css",
  to: "./.design-sync/.cache/compiled-globals.css",
});
writeFileSync("./.design-sync/.cache/compiled-globals.css", result.css);
console.log("wrote", result.css.length, "bytes");
