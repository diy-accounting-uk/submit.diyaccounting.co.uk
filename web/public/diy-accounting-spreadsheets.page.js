// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Lightbox functionality for images
(function () {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-image");
  const images = document.querySelectorAll(".lightbox-img");

  images.forEach((img) => {
    img.addEventListener("click", function () {
      lightboxImg.src = this.src;
      lightboxImg.alt = this.alt;
      lightbox.classList.add("active");
      document.body.style.overflow = "hidden";
    });
  });

  lightbox.addEventListener("click", function () {
    lightbox.classList.remove("active");
    document.body.style.overflow = "";
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && lightbox.classList.contains("active")) {
      lightbox.classList.remove("active");
      document.body.style.overflow = "";
    }
  });
})();
