const fs = require("fs");
const got = require("got");
const path = require("path");
const FormData = require("form-data");
const recursive = require("recursive-readdir");
const revisionHash = require("rev-hash");
const { default: PQueue } = require("p-queue");

const queue = new PQueue({ concurrency: 10 });

const IP = "192.168.42.3";
const LIBRARY = "/Users/tmcw/Documents/music-library";

let exclusions = {
  size: 0,
  date: 0,
  ext: 0,
  already: 0
};
(async function() {
  const body = await got(`http://${IP}/list?path=%2F`, {
    headers: {
      referer: `http://${IP}/`,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:72.0) Gecko/20100101 Firefox/72.0"
    }
  }).json();

  let uploaded = new Set(body.map(p => p.name));
  let toUpload = 0;

  recursive(LIBRARY, async (err, files) => {
    for (let file of files) {
      const stat = fs.statSync(file);
      if (path.extname(file) !== ".mp3") {
        // console.log(`Skipping ${file}, not an MP3`);
        exclusions.ext++;
        continue;
      }
      if (stat.size > 20000000) {
        // Skip, > 20mb
        // console.log(`Skipping ${file}, too large - ${stat.size}`);
        exclusions.size++;
        continue;
      }
      if (stat.birthtime < new Date() - 3 * 31557600 * 1000) {
        // console.log(`Skipping ${file}, too old`);
        exclusions.date++;
        continue;
      }

      const f = fs.readFileSync(file);
      let hash = revisionHash(f);
      const uploadName = `${hash}.mp3`;

      if (uploaded.has(uploadName)) {
        // console.log(`Skipping ${file} (already uploaded)`);
        exclusions.already++;
        continue;
      }

      toUpload++;
      queue.add(async () => {
        console.log(`Uploading ${file}`);
        const form = new FormData();
        form.append("path", "/");
        form.append(`files[]`, fs.createReadStream(file), uploadName);
        await got.post(`http://${IP}/upload`, {
          body: form
        });
      });
    }
    console.log(`Uploading: ${toUpload}`);
    console.log(exclusions);
  });
})();
