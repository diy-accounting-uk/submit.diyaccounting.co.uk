// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @vitest-environment happy-dom

// web/unit-tests/section-video.test.js

import { describe, test, expect } from "vitest";
import { addSectionVideos, sectionVideoFor, timeText } from "../public/lib/section-video.js";

const VIDEOS = [
  { id: "file-company-tax-return-typed", videoId: "typedId", title: "Typed", sections: { "section-period": 12 } },
  { id: "file-company-tax-return-with-accounts", videoId: "accountsId", title: "With accounts", sections: { "section-accounts": 95 } },
  { id: "file-company-tax-return-book", videoId: "bookId", title: "Book", sections: { "section-period": 7 } },
];

describe("the video that shows a form section", () => {
  test("takes the first video in the order that has the section, and none when no video has it", () => {
    expect(sectionVideoFor(VIDEOS, "section-period")).toEqual({ videoId: "typedId", title: "Typed", second: 12 });
    expect(sectionVideoFor(VIDEOS, "section-accounts")).toEqual({ videoId: "accountsId", title: "With accounts", second: 95 });
    expect(sectionVideoFor(VIDEOS, "section-loans")).toBeNull();
    expect(sectionVideoFor([{ ...VIDEOS[0], videoId: undefined }], "section-period")).toBeNull();
  });

  test("writes a second as minutes and seconds", () => {
    expect(timeText(0)).toBe("0:00");
    expect(timeText(83)).toBe("1:23");
    expect(timeText(605)).toBe("10:05");
  });

  test("puts a closed panel under the heading of each section a video shows, and loads the player only when opened", async () => {
    document.body.innerHTML = `
      <section id="section-period" class="form-section"><h3>Period</h3><p>form</p></section>
      <section id="section-loans" class="form-section"><h3>Loans</h3></section>`;
    await addSectionVideos(document, { fetchList: async () => ({ videos: VIDEOS }) });
    const panel = document.querySelector("#section-period > details.section-video");
    expect(panel.previousElementSibling.tagName).toBe("H3");
    expect(panel.open).toBe(false);
    expect(panel.querySelector("iframe")).toBeNull();
    expect(panel.querySelector("a").getAttribute("href")).toBe("https://youtu.be/typedId?t=12");
    expect(document.querySelector("#section-loans details")).toBeNull();
    panel.open = true;
    panel.dispatchEvent(new Event("toggle"));
    expect(panel.querySelector("iframe").getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/typedId?start=12");
    await addSectionVideos(document, { fetchList: async () => ({ videos: VIDEOS }) });
    expect(document.querySelectorAll("#section-period details.section-video")).toHaveLength(1);
  });
});
