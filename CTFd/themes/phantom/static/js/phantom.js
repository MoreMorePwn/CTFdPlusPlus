(() => {
  const updateCharts = () => {
    const dark = document.documentElement.dataset.bsTheme === "dark";
    const ink = dark ? "#f7f7f8" : "#17171a";
    const rule = dark ? "#424249" : "#d8d8de";
    const options = {
      color: ["#ed2336", "#00a6c2", "#a77bdf", "#e6a126", "#46a578"],
      textStyle: { color: ink, fontFamily: "Lato, Arial, sans-serif" },
      title: { textStyle: { color: ink } },
      legend: { textStyle: { color: ink }, pageTextStyle: { color: ink } },
      xAxis: [{ axisLabel: { color: ink } }],
      yAxis: [{ axisLabel: { color: ink } }],
      tooltip: {
        backgroundColor: dark ? "#242429" : "#ffffff",
        borderColor: rule,
        textStyle: { color: ink }
      },
      grid: { left: 24, right: 24, bottom: 80, top: 80, containLabel: true }
    };
    window.scoreboardChartOptions = options;
    window.userScoreGraphChartOptions = options;
    window.teamScoreGraphChartOptions = options;
  };

  updateCharts();
  new MutationObserver(() => {
    updateCharts();
    const graph = document.querySelector("#score-graph");
    if (graph && window.Alpine) {
      const detail = window.Alpine.$data(graph);
      if (detail && typeof detail.update === "function") detail.update();
      else if (detail && typeof detail.init === "function") detail.init();
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-bs-theme"] });

  document.querySelectorAll(".navbar .nav-link[href]").forEach(link => {
    if (new URL(link.href).pathname === window.location.pathname) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });
})();
