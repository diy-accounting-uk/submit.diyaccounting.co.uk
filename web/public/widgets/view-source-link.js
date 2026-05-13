(function () {
  // Load and display view source link
  async function loadViewSourceLink() {
    try {
      const deploymentUrl = new URL("../submit.deployment-name.txt", import.meta.url);
      const deploymentResponse = await fetch(deploymentUrl);
      let deploymentName = "";
      if (deploymentResponse.ok) {
        const deploymentText = await deploymentResponse.text();
        deploymentName = deploymentText.trim();
      }
      const versionUrl = new URL("../submit.version.txt", import.meta.url);
      const versionResponse = await fetch(versionUrl);
      if (versionResponse.ok) {
        const versionText = await versionResponse.text();
        const commitHash = versionText.trim();
        if (commitHash) {
          const githubUrl = `https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/blob/${commitHash}/web/public/${window.location.pathname}`;
          const viewSourceLink = document.getElementById("viewSourceLink");
          if (viewSourceLink) {
            viewSourceLink.href = githubUrl;
            viewSourceLink.target = "_blank";
            viewSourceLink.textContent = `${deploymentName}: @${commitHash.substring(0, 7)}`;
            // Respect debug gating: only show when debug widgets are enabled
            try {
              const enabled = typeof window !== "undefined" && !!window.__debugEnabled__;
              if (enabled) {
                viewSourceLink.style.display = "inline";
              }
            } catch (err) {
              // If anything goes wrong, do not force visibility
              console.warn("Failed to check debug enabled flag for view-source-link:", err.message, err.stack);
            }
          }
        }
      }
    } catch (error) {
      console.log("Could not load submit.version.txt:", error);
    }
  }

  // Initialize view source link
  function initializeViewSourceLink() {
    loadViewSourceLink();
  }

  // Expose functions globally for backward compatibility
  if (typeof window !== "undefined") {
    window.loadViewSourceLink = loadViewSourceLink;
    window.ViewSourceLink = {
      load: loadViewSourceLink,
      initialize: initializeViewSourceLink,
    };
  }

  // Auto-initialize if DOM is already loaded, otherwise wait for it
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeViewSourceLink);
  } else {
    initializeViewSourceLink();
  }
})();
