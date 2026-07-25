// ==UserScript==
// @name         三维家全景图（6比1）导出脚本
// @namespace    http://tampermonkey.net
// @version      1.0
// @description  基于上一版强力拦截机制优化，仅针对三维家720及渲染网段激活，全自动在线合并长图
// @author       AI Assistant
// @match        *://720.3vjia.com/*
// @match        *://3vj-render.3vjia.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const panoUrls = {};
    const suffixList = ['l', 'f', 'r', 'b', 'u', 'd'];

    const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
            const url = entry.name;
            if (url.includes('show_') && url.endsWith('.jpg')) {
                let groupId = '';
                const parts = url.split('/');
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i].startsWith('show_')) {
                        groupId = parts[i - 1];
                        break;
                    }
                }
                if (groupId) {
                    if (!panoUrls[groupId]) {
                        panoUrls[groupId] = { f: null, b: null, l: null, r: null, u: null, d: null };
                    }
                    suffixList.forEach(suffix => {
                        if (url.includes(`show_${suffix}.jpg`) && !panoUrls[groupId][suffix]) {
                            panoUrls[groupId][suffix] = url;
                            appendStatusRow(groupId, suffix);
                            updatePanelStatus();
                        }
                    });
                }
            }
        });
    });
    observer.observe({ entryTypes: ['resource'] });

    let panel, btn, listContainer;
    function createUI() {
        if (window.top !== window && !window.location.href.includes('720.3vjia.com')) return;
        if (document.getElementById('v3j-targeted-panel')) return;

        panel = document.createElement('div');
        panel.id = 'v3j-targeted-panel';
        panel.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;padding:15px;background:rgba(15,15,15,0.96);color:#fff;border-radius:10px;font-family:sans-serif;width:280px;box-shadow:0 8px 25px rgba(0,0,0,0.8);border:2px solid #00ff7f;max-height:80vh;overflow-y:auto;';

        const title = document.createElement('div');
        title.innerText = '三维家 show_ 独家在线拼接';
        title.style.cssText = 'font-weight:bold;font-size:13px;margin-bottom:10px;text-align:center;color:#00ff7f;border-bottom:1px solid #444;padding-bottom:6px;';
        panel.appendChild(title);

        listContainer = document.createElement('div');
        listContainer.id = 'v3j-list-container';
        panel.appendChild(listContainer);

        btn = document.createElement('button');
        btn.innerText = '等待载入完毕...';
        btn.disabled = true;
        btn.style.cssText = 'width:100%;padding:10px;background:#555;color:#ccc;border:none;border-radius:5px;cursor:not-allowed;font-weight:bold;margin-top:12px;transition:0.3s;';
        panel.appendChild(btn);

        document.body.appendChild(panel);
        btn.addEventListener('click', startOnlineStitch);
    }
        function appendStatusRow(groupId, suffix) {
        const targetDoc = window.top.document;
        const container = targetDoc.getElementById('v3j-list-container') || listContainer;
        if (!container) return;

        const shortGroupId = groupId.length > 12 ? (groupId.substring(0, 5) + '...' + groupId.substring(groupId.length - 5)) : groupId;
        const rowId = `status-${groupId}-${suffix}`;

        if (targetDoc.getElementById(rowId) || document.getElementById(rowId)) return;

        const item = targetDoc.createElement('div');
        item.id = rowId;
        item.style.cssText = 'font-size:11px;margin-bottom:4px;color:#aaa;display:flex;justify-content:space-between;border-bottom:1px dashed #333;padding-bottom:2px;';
        item.innerHTML = `<span>面 [ ${shortGroupId}/show_${suffix}.jpg ] :</span> <span class="state" style="color:#00ff7f;font-weight:bold;">捕获 OK</span>`;

        container.appendChild(item);
    }

    function updatePanelStatus() {
        if (!panel) createUI();
        let canDownload = false;
        let completeGroupsCount = 0;

        Object.keys(panoUrls).forEach(groupId => {
            let readyCount = 0;
            suffixList.forEach(suffix => { if (panoUrls[groupId][suffix]) readyCount++; });
            if (readyCount === 6) {
                canDownload = true;
                completeGroupsCount++;
            }
        });

        const activeBtn = window.top.document.querySelector('#v3j-targeted-panel button') || btn;
        if (activeBtn) {
            if (canDownload) {
                activeBtn.innerText = `立即合并下载全景图 (${completeGroupsCount}个地点)`;
                activeBtn.disabled = false;
                activeBtn.style.background = '#28a745';
                activeBtn.style.color = '#fff';
                activeBtn.style.cursor = 'pointer';
            } else {
                activeBtn.innerText = '等待载入完毕...';
                activeBtn.disabled = true;
                activeBtn.style.background = '#555';
                activeBtn.style.color = '#ccc';
                activeBtn.style.cursor = 'not-allowed';
            }
        }
    }

async function startOnlineStitch() {
    const activeBtn = window.top.document.querySelector('#v3j-targeted-panel button') || btn;
    activeBtn.disabled = true;
    activeBtn.innerText = '正在云端拼轨合并...';

    const groupsToStitch = [];
    Object.keys(panoUrls).forEach(groupId => {
        let readyCount = 0;
        suffixList.forEach(suffix => { if (panoUrls[groupId][suffix]) readyCount++; });
        if (readyCount === 6) { groupsToStitch.push(groupId); }
    });

    for (let g = 0; g < groupsToStitch.length; g++) {
        const groupId = groupsToStitch[g];
        const currentGroupUrls = panoUrls[groupId];

        try {
            activeBtn.innerText = `正在合成分组 (${g + 1}/${groupsToStitch.length})...`;
            const images = await Promise.all(suffixList.map(suffix => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => resolve(img);
                    img.onerror = () => reject();
                    img.src = currentGroupUrls[suffix];
                });
            }));

            const w = images[0].width;
            const h = images[0].height;

            const canvas = document.createElement('canvas');
            canvas.width = w * 6;
            canvas.height = h;
            const ctx = canvas.getContext('2d');

            // ------------------- 修改区开始 -------------------
            images.forEach((img, i) => {
                const suffix = suffixList[i];
                if (suffix === 'u') {
                    ctx.save();
                    ctx.translate(i * w + w / 2, h / 2);
                    ctx.rotate(-Math.PI/2);
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                    ctx.restore();
                } else if (suffix === 'd') {
                    ctx.save();
                    ctx.translate(i * w + w / 2, h / 2);
                    ctx.rotate(Math.PI / 2);
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                    ctx.restore();
                } else {
                    ctx.drawImage(img, i * w, 0, w, h);
                }
            });
            // ------------------- 修改区结束 -------------------

            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `3Vjia_${groupId}_Stitched.jpg`;
            a.click();
        } catch (e) {
            console.error(e);
        }
    }

    activeBtn.innerText = '批量合并导出成功！';
    setTimeout(() => updatePanelStatus(), 3000);
    }
})();