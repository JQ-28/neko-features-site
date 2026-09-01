/* 健康分析：身高体重年龄性别 → BMI/体脂/代谢等 */
(() => {
  const v = (x) => (x === undefined || x === null ? '-' : x);
  const item = (val, lbl) => `<div class="hc-item"><div class="hc-val">${esc(v(val))}</div><div class="hc-lbl">${esc(lbl)}</div></div>`;
  const metric = (val, lbl) => `<div class="hc-metric"><div class="hc-val">${esc(v(val))}</div><div class="hc-lbl">${esc(lbl)}</div></div>`;
  const secTitle = (icon, t) => `<div class="hc-title"><span class="hc-icon">${esc(icon)}</span>${esc(t)}</div>`;

  const renderCard = (d) => {
    const bi = d.basic_info || {}, b = d.bmi || {}, wa = d.weight_assessment || {};
    const m = d.metabolism || {}, bf = d.body_fat || {}, sa = d.body_surface_area || {};
    const ha = d.health_advice || {}, im = d.ideal_measurements || {};
    return `<div class="health-card">
      <div class="hc-pattern"></div>
      <div class="hc-header"><span>身体健康分析</span><span class="hc-tag">${esc(v(b.category))}</span></div>
      <div class="hc-body">
        <div class="hc-info">${item(bi.height, '身高')}${item(bi.weight, '体重')}${item(bi.gender, '性别')}${item(bi.age, '年龄')}</div>
        <div class="hc-section">
          ${secTitle('B', 'BMI 体重指数')}
          <div class="hc-bmi"><span class="hc-bmi-val">${esc(v(b.value))}</span><span class="hc-badge">${esc(v(b.category))}</span></div>
          <div class="hc-grid">${metric(b.evaluation, 'BMI 评价')}${metric(b.risk, '健康风险')}</div>
        </div>
        <div class="hc-section">
          ${secTitle('W', '体重评估')}
          <div class="hc-grid">${metric(wa.ideal_weight_range, '理想体重范围')}${metric(wa.standard_weight, '标准体重')}${metric(wa.status, '体重状态')}${metric(wa.adjustment, '调整建议')}</div>
        </div>
        <div class="hc-section">
          ${secTitle('M', '代谢数据')}
          <div class="hc-grid">${metric(m.bmr, '基础代谢 (BMR)')}${metric(m.tdee, '每日消耗 (TDEE)')}${metric(m.recommended_calories, '推荐摄入')}${metric(sa.value, `体表面积 (${v(sa.formula)})`)}</div>
        </div>
        <div class="hc-section">
          ${secTitle('F', '体脂 & 理想三围')}
          <div class="hc-grid">${metric(`${v(bf.percentage)} (${v(bf.category)})`, '体脂率')}${metric(`${v(bf.fat_weight)} / ${v(bf.lean_weight)}`, '脂肪 / 瘦体重')}${metric(`${v(im.chest)} / ${v(im.waist)} / ${v(im.hip)}`, '理想三围 (胸/腰/臀)')}${metric(im.note, '参考标准')}</div>
        </div>
        <div class="hc-section">
          ${secTitle('A', '健康建议')}
          <div class="hc-grid" style="margin-bottom:8px">${metric(ha.daily_water_intake, '每日饮水')}${metric(ha.exercise_recommendation, '运动建议')}</div>
          ${metric(ha.nutrition_advice, '营养建议')}
        </div>
        <div class="hc-section">
          ${secTitle('T', '健康提示')}
          <ul class="hc-tips">${(ha.health_tips || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="hc-footer"><div class="hc-disclaimer">${esc(v(d.disclaimer))}</div></div>
      <div class="hc-accent"></div>
    </div>`;
  };

  window.__features.health = {
    renderer: () =>
      `<input type="text" id="health-input" placeholder="身高cm 体重kg 年龄 性别，如：176 60 24 男" onkeydown="if(event.key==='Enter')__run('health')" />
       <button class="act" onclick="__run('health')">分析</button>`,
    run: () => guard('health', async () => {
      const raw = $('health-input').value.trim();
      const nums = (raw.match(/\d+(?:\.\d+)?/g) || []).map(Number);
      if (!raw || nums.length < 3) return addMsg('neko', '格式不对呀喵～按「身高 体重 年龄 性别」填哦，例如：176 60 24 男');
      let [height, weight, age] = nums;
      if (height < 50 || height > 300) [height, age] = [age, height];
      if (height <= 30 || height >= 290 || weight <= 15 || weight >= 420) {
        markEgg('healthPig', pickArr(HEALTH_PIG_LINES));
        return addMsg('neko', '这是人还是猪呀喵？！这种数字 neko 没法分析啦～按「身高 体重 年龄 性别」填哦，例如：176 60 24 男');
      }
      if (!(height >= 50 && height <= 300 && weight >= 10 && weight <= 500 && age >= 1 && age <= 150)) {
        return addMsg('neko', '数字有点怪呀喵～身高(cm)体重(kg)年龄要对得上哦，例如：176 60 24 男');
      }
      const gender = /女/.test(raw) ? 'female' : 'male';
      $('health-input').value = '';
      addMsg('user', esc(raw));
      addMsg('neko', pickLine('health'));
      try {
        const d = await (await fetch(`/api/health?height=${height}&weight=${weight}&age=${age}&gender=${gender}`)).json();
        if (d.error) return addMsg('neko', '呜…分析失败啦喵：' + esc(d.error));
        addMsg('neko', renderCard(d));
      } catch (e) {
        addMsg('neko', '呜…分析失败啦喵：' + esc(e.message || String(e)));
      }
    }),
  };
})();
