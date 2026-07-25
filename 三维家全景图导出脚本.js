// ==UserScript==
// @name         三维家全景图导出 (等距柱状投影版)
// @namespace    http://tampermonkey.net
// @version      1.0
// @description  基于上一版强力拦截机制优化，仅针对三维家720及渲染网段激活，自动捕获六面图并合成2:1等距柱状全景图，前后左右面做上下翻转修正
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
        title.innerText = '三维家 show_ 全景合成 (2:1等距柱状)';
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
                activeBtn.innerText = `合成全景图 (${completeGroupsCount}个地点)`;
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
        activeBtn.innerText = '正在合成等距柱状投影图...';

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
                if (w !== h) console.warn('图片非正方形，可能影响全景合成效果');

                const imageDataList = images.map(img => {
                    const c = document.createElement('canvas');
                    c.width = w;
                    c.height = h;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    return ctx.getImageData(0, 0, w, h);
                });

                const outW = w * 2;
                const outH = w;
                const outCanvas = document.createElement('canvas');
                outCanvas.width = outW;
                outCanvas.height = outH;
                const outCtx = outCanvas.getContext('2d');
                const outData = outCtx.createImageData(outW, outH);
                const outPixels = outData.data;

                const faceNormals = [
                    [-1, 0, 0], // l
                    [0, 0, 1],  // f
                    [1, 0, 0],  // r
                    [0, 0, -1], // b
                    [0, 1, 0],  // u
                    [0, -1, 0]  // d
                ];
                const faceUV = {
                    2: { u: [0, 0, -1], v: [0, 1, 0] },
                    0: { u: [0, 0, 1], v: [0, 1, 0] },
                    4: { u: [1, 0, 0], v: [0, 0, 1] },
                    5: { u: [1, 0, 0], v: [0, 0, -1] },
                    1: { u: [1, 0, 0], v: [0, 1, 0] },
                    3: { u: [-1, 0, 0], v: [0, 1, 0] }
                };

                for (let y = 0; y < outH; y++) {
                    for (let x = 0; x < outW; x++) {
                        const theta = 2 * Math.PI * (x / outW) - Math.PI;
                        const phi = Math.PI / 2 - Math.PI * (y / outH);
                        const dirX = Math.cos(phi) * Math.sin(theta);
                        const dirY = Math.sin(phi);
                        const dirZ = Math.cos(phi) * Math.cos(theta);

                        const absX = Math.abs(dirX), absY = Math.abs(dirY), absZ = Math.abs(dirZ);
                        let faceIdx = 0, maxAxis = 'x';
                        if (absX >= absY && absX >= absZ) {
                            maxAxis = 'x';
                            faceIdx = dirX > 0 ? 2 : 0;
                        } else if (absY >= absX && absY >= absZ) {
                            maxAxis = 'y';
                            faceIdx = dirY > 0 ? 4 : 5;
                        } else {
                            maxAxis = 'z';
                            faceIdx = dirZ > 0 ? 1 : 3;
                        }

                        const uVec = faceUV[faceIdx].u;
                        const vVec = faceUV[faceIdx].v;
                        let u = dirX * uVec[0] + dirY * uVec[1] + dirZ * uVec[2];
                        let v = dirX * vVec[0] + dirY * vVec[1] + dirZ * vVec[2];
                        let maxVal = (maxAxis === 'x') ? absX : (maxAxis === 'y' ? absY : absZ);
                        u /= maxVal;
                        v /= maxVal;

                        let texU = (u + 1) / 2;
                        let texV = (v + 1) / 2;

                        // ========== 修正：前后左右（索引0~3）上下翻转（垂直镜像） ==========
                        if (faceIdx < 4) {
                            // texU = 1 - texU; // 如需水平镜像，取消注释
                            texV = 1 - texV;   // 仅垂直翻转
                        }
                        // ================================================================

                        const imgData = imageDataList[faceIdx];
                        const srcW = w, srcH = h;
                        const px = texU * (srcW - 1);
                        const py = texV * (srcH - 1);
                        const ix = Math.floor(px), iy = Math.floor(py);
                        const fx = px - ix, fy = py - iy;
                        const ix1 = Math.min(ix + 1, srcW - 1);
                        const iy1 = Math.min(iy + 1, srcH - 1);
                        const ix0 = Math.max(ix, 0), iy0 = Math.max(iy, 0);

                        const getPixel = (data, x, y) => {
                            const idx = (y * srcW + x) * 4;
                            return [data.data[idx], data.data[idx+1], data.data[idx+2], data.data[idx+3]];
                        };
                        const c00 = getPixel(imgData, ix0, iy0);
                        const c10 = getPixel(imgData, ix1, iy0);
                        const c01 = getPixel(imgData, ix0, iy1);
                        const c11 = getPixel(imgData, ix1, iy1);

                        const r = (1-fx)*(1-fy)*c00[0] + fx*(1-fy)*c10[0] + (1-fx)*fy*c01[0] + fx*fy*c11[0];
                        const g = (1-fx)*(1-fy)*c00[1] + fx*(1-fy)*c10[1] + (1-fx)*fy*c01[1] + fx*fy*c11[1];
                        const b = (1-fx)*(1-fy)*c00[2] + fx*(1-fy)*c10[2] + (1-fx)*fy*c01[2] + fx*fy*c11[2];
                        const a = (1-fx)*(1-fy)*c00[3] + fx*(1-fy)*c10[3] + (1-fx)*fy*c01[3] + fx*fy*c11[3];

                        const outIdx = (y * outW + x) * 4;
                        outPixels[outIdx] = r;
                        outPixels[outIdx+1] = g;
                        outPixels[outIdx+2] = b;
                        outPixels[outIdx+3] = a;
                    }
                }

                outCtx.putImageData(outData, 0, 0);
                const dataUrl = outCanvas.toDataURL('image/jpeg', 0.95);
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `3Vjia_${groupId}_Equirectangular.jpg`;
                a.click();

            } catch (e) {
                console.error('拼接失败:', e);
                alert('分组 ' + groupId + ' 合成失败，请检查网络或图片跨域');
            }
        }

        activeBtn.innerText = '批量合并导出成功！';
        setTimeout(() => updatePanelStatus(), 3000);
    }

    createUI();
})();