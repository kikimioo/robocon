class RefereeSystem {
    constructor() {
        this.gameModes = {
            '小组循环赛': 160,
            '淘汰赛': 240,
            '自定义': 200
        };
        
        // 设置默认为小组循环赛
        this.gameTime = this.gameModes['小组循环赛'];
        this.defaultSetupTime = 60;
        this.customSetupTime = this.defaultSetupTime;
        this.shotClock = 20;
        this.possessionTime = 5;
        
        this.scores = {
            blue: 0,
            red: 0
        };
        this.teamNames = {
            blue: 'Blue',
            red: 'Red'
        };
        this.currentPhase = 'setup';
        this.currentPossession = 'red';
        this.isRunning = false;
        this.last_update = null;
        this.roundStartTime = 0;
        this.roundScores = {
            red: { 2: 0, 3: 0, 7: 0 },
            blue: { 2: 0, 3: 0, 7: 0 }
        };
        this.nextPossession = null;
        this.nextPossessionRequested = null;
        this.setupPossessionTime = 5;  // 准备阶段结束后的占有时间
        this.roundPossessionTime = 10;  // 回合之间的占有时间

        // 修改音频元素引用
        this.roundStartSound = document.getElementById('roundStartSound');
        this.countdown3Sound = document.getElementById('countdown3Sound');
        this.countdown2Sound = document.getElementById('countdown2Sound');
        this.countdown1Sound = document.getElementById('countdown1Sound');
        this.countdown0Sound = document.getElementById('countdown0Sound');
        this.lastPlayedSecond = null;  // 记录上次播放的秒数

        // 初始化显示
        this.updateDisplay();
        this.bindControls();
        this.formatTime = this.formatTime.bind(this);

        // 添加声音设置
        this.soundSettings = {
            countdownSound: true,  // 倒计时提示音
            roundStartSound: true  // 回合开始声音
        };

        this.currentMode = '小组循环赛';  // 添加当前模式变量
        this.setupTime = this.defaultSetupTime;  // 确保准备时间正确初始化

        // 添加犯规记录
        this.fouls = {
            blue: 0,
            red: 0
        };
    }

    bindControls() {
        // 强制重启按钮
        const forceRestartButton = document.querySelector('.settings .control-btn:first-child');
        forceRestartButton.addEventListener('click', () => {
            this.forceRestart();
        });

        // 设置按钮 - 修改选择器并添加事件监听
        const settingsButton = document.querySelector('.settings .control-btn:last-child');
        settingsButton.addEventListener('click', () => {
            this.showSettingsDialog();
        });

        // 下一个按钮（跳过准备阶段）
        const skipButton = document.querySelector('.control-buttons button:nth-child(1)');
        skipButton.addEventListener('click', () => {
            if (this.currentPhase === 'setup') {
                this.setupTime = 0;
                this.currentPhase = 'possession';
                this.possessionTime = 5;
                // 如果没有预设的下一回合，默认设置为红队
                if (!this.nextPossession) {
                    this.nextPossession = 'red';
                }
                // 确保当前回合和下一回合显示一致
                this.currentPossession = this.nextPossession;
                
                if (!this.isRunning) {
                    this.start();
                }
                this.updateDisplay();
            }
        });

        // 开始按钮
        const startButton = document.querySelector('.control-buttons button:nth-child(2)');
        startButton.addEventListener('click', () => {
            if (!this.isRunning) {
                this.start();
            }
        });

        // 暂停按钮
        const pauseButton = document.querySelector('.control-buttons button:nth-child(3)');
        pauseButton.addEventListener('click', () => {
            if (this.isRunning) {
                this.isRunning = false;
            } else if (this.currentPhase !== 'setup') {
                this.isRunning = true;
                this.last_update = Date.now();
                this.updateTimer();
            }
        });

        // 重置按钮
        const resetButton = document.querySelector('.control-buttons button:nth-child(4)');
        resetButton.addEventListener('click', () => {
            this.reset();
        });

        // 得分按钮事件绑定
        document.querySelectorAll('.score-area-left .score-box').forEach(box => {
            const points = parseInt(box.querySelector('.score-display').getAttribute('data-points'));
            box.querySelector('.score-minus').addEventListener('click', () => {
                if (this.currentPhase === 'playing') {  // 只在比赛阶段可以加分
                    this.addScore('red', -points);
                }
            });
            box.querySelector('.score-plus').addEventListener('click', () => {
                if (this.currentPhase === 'playing') {  // 只在赛阶段可以加分
                    this.addScore('red', points);
                }
            });
        });

        document.querySelectorAll('.score-area-right .score-box').forEach(box => {
            const points = parseInt(box.querySelector('.score-display').getAttribute('data-points'));
            box.querySelector('.score-minus').addEventListener('click', () => {
                if (this.currentPhase === 'playing') {  // 只在比赛阶段可以加分
                    this.addScore('blue', -points);
                }
            });
            box.querySelector('.score-plus').addEventListener('click', () => {
                if (this.currentPhase === 'playing') {  // 只在比赛阶段可以加分
                    this.addScore('blue', points);
                }
            });
        });

        // 左侧（蓝队）按钮
        const blueNextButton = document.querySelector('.team-blue .control-btn:nth-child(4)');
        const blueStartButton = document.querySelector('.team-blue .control-btn:nth-child(5)');
        
        blueNextButton.addEventListener('click', () => {
            // 设置下一回合为蓝队
            this.nextPossession = 'blue';
            // 如果当前是占有时间阶段，直接更新显示
            if (this.currentPhase === 'possession') {
                this.currentPossession = 'blue';
            }
            this.updateDisplay();
        });
        
        blueStartButton.addEventListener('click', () => {
            if (this.currentPhase === 'playing' || this.currentPhase === 'possession') {
                // 如果当前不是蓝队回合，则重置计时器
                const needReset = this.currentPossession !== 'blue';
                
                this.currentPhase = 'playing';
                this.currentPossession = 'blue';
                this.nextPossession = null;  // 清除预设的下一回合
                
                // 如果是从其他队伍切换过来，重置计时器
                if (needReset) {
                    this.shotClock = 20;
                    this.roundStartTime = Date.now();
                }
                
                // 如果游戏暂停，则重新开始
                if (!this.isRunning) {
                    this.isRunning = true;
                    this.last_update = Date.now();
                    this.updateTimer();
                }
                
                this.updateDisplay();
            }
        });

        // 右侧（红队）按钮
        const redNextButton = document.querySelector('.team-red .control-btn:nth-child(4)');
        const redStartButton = document.querySelector('.team-red .control-btn:nth-child(5)');
        
        redNextButton.addEventListener('click', () => {
            // 设置下一回合为红队
            this.nextPossession = 'red';
            // 如果是占有时间阶段，直接更新显示
            if (this.currentPhase === 'possession') {
                this.currentPossession = 'red';
            }
            this.updateDisplay();
        });
        
        redStartButton.addEventListener('click', () => {
            if (this.currentPhase === 'playing' || this.currentPhase === 'possession') {
                // 如果当前不是红队回合，则重置计时器
                const needReset = this.currentPossession !== 'red';
                
                this.currentPhase = 'playing';
                this.currentPossession = 'red';
                this.nextPossession = null;  // 清除预设的下一回合
                
                // 如果是从其他队伍切换过来，重置计时器
                if (needReset) {
                    this.shotClock = 20;
                    this.roundStartTime = Date.now();
                }
                
                // 如果游戏暂停，则重新开始
                if (!this.isRunning) {
                    this.isRunning = true;
                    this.last_update = Date.now();
                    this.updateTimer();
                }
                
                this.updateDisplay();
            }
        });

        // 修改犯规按钮事件绑定
        const blueFoulBtn = document.querySelector('.blue-foul');
        const redFoulBtn = document.querySelector('.red-foul');
        const penaltyTrigger = document.querySelector('.penalty-trigger');
        const penaltyModal = document.querySelector('.penalty-modal');

        if (blueFoulBtn) {
            blueFoulBtn.addEventListener('click', () => {
                this.recordFoul('blue');
            });
        }

        if (redFoulBtn) {
            redFoulBtn.addEventListener('click', () => {
                this.recordFoul('red');
            });
        }

        if (penaltyTrigger) {
            penaltyTrigger.addEventListener('click', () => {
                penaltyModal.style.display = 'flex';
            });
        }

        // 点击模态框背景关闭
        if (penaltyModal) {
            penaltyModal.addEventListener('click', (e) => {
                if (e.target === penaltyModal) {
                    penaltyModal.style.display = 'none';
                }
            });

            // 罚球按钮点击事件
            penaltyModal.querySelectorAll('.penalty-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const team = btn.getAttribute('data-team');
                    const points = parseInt(btn.getAttribute('data-points'));
                    this.addPenaltyScore(team, points);
                    penaltyModal.style.display = 'none';
                });
            });
        }
    }

    showSettingsDialog() {
        // 创建设置对话框
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 1000;
            min-width: 300px;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
        `;

        // 添加比赛模式选择和自定义时间设置
        const modeSection = document.createElement('div');
        modeSection.innerHTML = `
            <h3 style="color: black;">比赛模式</h3>
            ${Object.keys(this.gameModes).map(mode => `
                <label style="color: black; display: block; margin: 10px 0;">
                    <input type="radio" name="gameMode" value="${mode}" 
                           ${mode === '小组循环赛' ? 'checked' : ''}>
                    ${mode} ${mode !== '自定义' ? `(${this.gameModes[mode]}秒)` : ''}
                </label>
            `).join('')}
            <div id="customTimeSettings" style="margin-left: 20px; ${this.gameTime === this.gameModes['自定义'] ? '' : 'display: none;'}">
                <div style="margin: 10px 0;">
                    <label style="color: black;">准备时间（秒）：</label>
                    <input type="number" id="setupTime" value="${this.customSetupTime}" min="0" style="width: 60px;">
                </div>
                <div style="margin: 10px 0;">
                    <label style="color: black;">比赛时间（秒）：</label>
                    <input type="number" id="gameTime" value="${this.gameModes['自定义']}" min="0" style="width: 60px;">
                </div>
            </div>
        `;

        // 添加队伍名称设置
        const nameSection = document.createElement('div');
        nameSection.innerHTML = `
            <h3 style="color: black;">队伍名称</h3>
            <div style="margin: 10px 0;">
                <label style="color: black;">蓝名称：</label>
                <input type="text" id="blueTeamName" value="${this.teamNames.blue}">
            </div>
            <div style="margin: 10px 0;">
                <label style="color: black;">红队名称：</label>
                <input type="text" id="redTeamName" value="${this.teamNames.red}">
            </div>
        `;

        // 添加声音设置
        const soundSection = document.createElement('div');
        soundSection.innerHTML = `
            <h3 style="color: black;">声音设置</h3>
            <div style="margin: 10px 0;">
                <label style="color: black; display: block; margin: 5px 0;">
                    <input type="checkbox" id="countdownSound" ${this.soundSettings.countdownSound ? 'checked' : ''}>
                    倒计时提示音
                </label>
                <label style="color: black; display: block; margin: 5px 0;">
                    <input type="checkbox" id="roundStartSound" ${this.soundSettings.roundStartSound ? 'checked' : ''}>
                    回合开始声音
                </label>
            </div>
        `;

        // 添加按钮
        const buttonSection = document.createElement('div');
        buttonSection.style.cssText = 'margin-top: 20px; text-align: right;';
        buttonSection.innerHTML = `
            <button style="margin: 0 5px; padding: 5px 15px;">取消</button>
            <button style="margin: 0 5px; padding: 5px 15px; background: #48bb78; color: white; border: none; border-radius: 5px;">确认</button>
        `;

        // 按正确顺序添加所有部分
        dialog.appendChild(modeSection);
        dialog.appendChild(nameSection);
        dialog.appendChild(soundSection);
        dialog.appendChild(buttonSection);

        // 添加模式选择事件监听
        modeSection.addEventListener('change', (e) => {
            if (e.target.name === 'gameMode') {
                const customSettings = document.getElementById('customTimeSettings');
                customSettings.style.display = e.target.value === '自定义' ? 'block' : 'none';
            }
        });

        // 添加遮罩层
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999;
        `;

        // 添加到页面
        document.body.appendChild(overlay);
        document.body.appendChild(dialog);

        // 处理按钮点击
        const [cancelBtn, confirmBtn] = buttonSection.querySelectorAll('button');
        
        cancelBtn.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(dialog);
        };

        confirmBtn.onclick = () => {
            const selectedMode = dialog.querySelector('input[name="gameMode"]:checked').value;
            
            if (selectedMode === '自定义') {
                const setupTime = parseInt(dialog.querySelector('#setupTime').value);
                const gameTime = parseInt(dialog.querySelector('#gameTime').value);
                this.customSetupTime = setupTime;
                this.gameModes['自定义'] = gameTime;
                this.setupTime = setupTime;
                this.gameTime = gameTime;
                this.currentMode = '自定义';
            } else {
                this.gameTime = this.gameModes[selectedMode];
                this.setupTime = this.defaultSetupTime;
                this.currentMode = selectedMode;
            }

            // 更新队伍名称
            this.teamNames.blue = dialog.querySelector('#blueTeamName').value;
            this.teamNames.red = dialog.querySelector('#redTeamName').value;

            // 更新声音设置
            this.soundSettings.countdownSound = dialog.querySelector('#countdownSound').checked;
            this.soundSettings.roundStartSound = dialog.querySelector('#roundStartSound').checked;

            // 更新显示
            this.updateTeamNames();
            this.updateDisplay();

            // 关闭对话框
            document.body.removeChild(overlay);
            document.body.removeChild(dialog);
        };

        // 点击遮罩层关闭对话框
        overlay.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(dialog);
        };
    }

    updateTeamNames() {
        // 更新队伍名称显示
        document.querySelector('.team-blue .team-name').textContent = this.teamNames.blue;
        document.querySelector('.team-red .team-name').textContent = this.teamNames.red;
    }

    start() {
        console.log('Starting game...');
        if (!this.isRunning) {
            this.isRunning = true;
            this.last_update = Date.now();
            this.updateTimer();
        }
    }

    pause() {
        this.isRunning = false;
    }

    reset() {
        this.isRunning = false;
        this.setupTime = this.defaultSetupTime;
        this.gameTime = this.gameModes[Object.keys(this.gameModes)[0]];
        this.possessionTime = 5;
        this.scores = { blue: 0, red: 0 };
        this.currentPhase = 'setup';
        this.currentPossession = 'red';
        this.roundScores = {
            red: { 2: 0, 3: 0, 7: 0 },
            blue: { 2: 0, 3: 0, 7: 0 }
        };
        this.nextPossession = null;
        this.nextPossessionRequested = null;
        this.updateDisplay();
    }

    addScore(team, points) {
        // 只有在比赛阶段且游戏正在运行时才能加分
        if (this.currentPhase === 'playing' && this.isRunning) {
            // 更新总分
            this.scores[team] += points;
            
            // 更新得分次数
            if (points > 0) {
                this.roundScores[team][points]++;
            } else {
                // 确保减分时不会出现负数
                this.roundScores[team][-points] = Math.max(0, this.roundScores[team][-points] - 1);
            }
            
            // 计算本回合用时
            const roundTime = 20 - this.shotClock;
            
            // 添加到历史记录
            const historyEntry = {
                action: `${points > 0 ? '得' : '失'}${Math.abs(points)}分`,
                time: roundTime.toFixed(2)
            };
            this.addToHistory(team, historyEntry);
            
            // 切换到占有时间，并根据当前回合设置下一回合
            this.currentPhase = 'possession';
            this.possessionTime = this.roundPossessionTime;  // 使用10秒
            
            // 如果没有预设下一回合，则切换到另一队
            if (!this.nextPossession) {
                this.nextPossession = this.currentPossession === 'red' ? 'blue' : 'red';
            }
            
            this.updateDisplay();

            this.playSound(this.roundStartSound);  // 得分后回合结束音
            this.lastPlayedSecond = null;  // 重置倒计声音状态
        }
    }

    addToHistory(team, entry) {
        const historyDiv = document.querySelector(`.team-${team} .history-section .history-content`);
        const newEntry = document.createElement('div');
        newEntry.style.display = 'flex';
        newEntry.style.justifyContent = 'space-between';
        newEntry.innerHTML = `
            <span>${entry.action}</span>
            <span>${entry.time}秒</span>
        `;
        historyDiv.appendChild(newEntry);
    }

    switchPossession() {
        this.currentPhase = 'possession';
        this.currentPossession = this.currentPossession === 'red' ? 'blue' : 'red';
        this.possessionTime = 5;
        
        // 更新显示当前回合
        const possessionText = this.currentPossession === 'red' ? '红队回合' : '蓝队���合';
        document.querySelector('.phase-text').textContent = possessionText;
    }

    updateTimer() {
        if (this.isRunning) {
            const now = Date.now();
            const elapsed = (now - this.last_update) / 1000;
            this.last_update = now;

            switch(this.currentPhase) {
                case 'setup':
                    this.setupTime = Math.max(0, this.setupTime - elapsed);
                    if (this.setupTime <= 0) {
                        this.currentPhase = 'possession';
                        this.possessionTime = this.setupPossessionTime;  // 使用5秒
                        if (!this.nextPossession) {
                            this.nextPossession = 'red';
                        }
                        this.currentPossession = this.nextPossession;
                    }
                    break;

                case 'possession':
                    this.possessionTime = Math.max(0, this.possessionTime - elapsed);
                    if (this.possessionTime <= 0) {
                        this.currentPhase = 'playing';
                        this.shotClock = 20;
                        if (this.nextPossession) {
                            this.currentPossession = this.nextPossession;
                            this.nextPossession = null;
                        }
                        this.playSound(this.roundStartSound);  // 回合开始音
                    }
                    break;

                case 'playing':
                    this.gameTime = Math.max(0, this.gameTime - elapsed);
                    this.shotClock = Math.max(0, this.shotClock - elapsed);
                    
                    // 修改倒计时声音的触发逻辑
                    const currentSecond = Math.floor(this.shotClock + 0.99);  // 向上取整，但提前一点触发
                    if (currentSecond <= 3 && currentSecond !== this.lastPlayedSecond) {
                        this.lastPlayedSecond = currentSecond;
                        switch(currentSecond) {
                            case 3:
                                if (this.shotClock <= 3.99) this.playSound(this.countdown3Sound);
                                break;
                            case 2:
                                if (this.shotClock <= 2.99) this.playSound(this.countdown2Sound);
                                break;
                            case 1:
                                if (this.shotClock <= 1.99) this.playSound(this.countdown1Sound);
                                break;
                            case 0:
                                if (this.shotClock <= 0.99) this.playSound(this.countdown0Sound);
                                break;
                        }
                    }
                    
                    if (this.shotClock <= 0) {
                        this.currentPhase = 'possession';
                        this.possessionTime = this.roundPossessionTime;
                        if (!this.nextPossession) {
                            this.nextPossession = this.currentPossession === 'red' ? 'blue' : 'red';
                        }
                        this.lastPlayedSecond = null;  // 重置倒计时声音状态
                    }
                    if (this.gameTime <= 0) {
                        this.endGame();
                        return;
                    }
                    break;
            }

            this.updateDisplay();
            requestAnimationFrame(() => this.updateTimer());
        }
    }

    updateDisplay() {
        // 更新主计时器显示（准备时间/比赛时）
        let mainDisplayTime;
        let phaseText;

        if (this.currentPhase === 'setup') {
            mainDisplayTime = this.setupTime;
            phaseText = `${this.currentMode} - 准备时间`;  // 显示当前模式和准备时间
            document.querySelector('.phase-text').classList.add('setup');
        } else {
            mainDisplayTime = this.gameTime;
            if (this.currentPhase === 'playing') {
                phaseText = this.currentPossession === 'red' ? '红队回合' : '蓝队回合';
                document.querySelector('.phase-text').classList.add(this.currentPossession);
            } else if (this.currentPhase === 'possession') {
                phaseText = `下一回合：${this.nextPossession === 'red' ? '红队' : '蓝队'}`;
                document.querySelector('.phase-text').classList.add(this.nextPossession);
            }
        }

        document.querySelector('.main-timer').textContent = this.formatTime(mainDisplayTime);
        document.querySelector('.phase-text').textContent = phaseText;

        // 始终显占有时间（即使不在占有阶段）
        const phaseTimerElement = document.querySelector('.phase-timer');
        phaseTimerElement.textContent = `占有时间 ${this.formatTime(this.currentPhase === 'possession' ? this.possessionTime : 5.000)}`;

        // 移除按钮状态控制，使按钮始终可用
        const blueButtons = document.querySelectorAll('.team-blue .control-btn');
        const redButtons = document.querySelectorAll('.team-red .control-btn');
        
        [blueButtons, redButtons].forEach(buttons => {
            buttons.forEach(button => {
                button.disabled = false;
                button.style.opacity = '1';
                button.style.cursor = 'pointer';
            });
        });

        // 更新两侧20秒计时器
        const blueTimer = document.querySelector('.team-blue .timer-display');
        const redTimer = document.querySelector('.team-red .timer-display');
        
        if (this.currentPhase === 'playing') {
            if (this.currentPossession === 'blue') {
                blueTimer.textContent = this.shotClock.toFixed(2);
                redTimer.textContent = "20.00";
            } else {
                redTimer.textContent = this.shotClock.toFixed(2);
                blueTimer.textContent = "20.00";
            }
        } else {
            blueTimer.textContent = "20.00";
            redTimer.textContent = "20.00";
        }

        // 更新得分显示
        document.querySelector('.team-blue .team-score').textContent = this.scores.blue;
        document.querySelector('.team-red .team-score').textContent = this.scores.red;

        // 更新得分按钮显示（显示得分次数）
        this.updateScoreButtons();

        // 更新队伍区域的闪烁效果
        const blueSection = document.querySelector('.team-blue');
        const redSection = document.querySelector('.team-red');
        
        // 移除所有活动状态
        blueSection.classList.remove('active');
        redSection.classList.remove('active');
        
        // 根据当前回合或下一回合添加闪烁效果
        if (this.currentPhase === 'playing') {
            // 比赛阶段，当前回合方闪烁
            if (this.currentPossession === 'blue') {
                blueSection.classList.add('active');
            } else {
                redSection.classList.add('active');
            }
        } else if (this.currentPhase === 'possession') {
            // 占有时间阶段，下一回合方闪烁
            if (this.nextPossession === 'blue') {
                blueSection.classList.add('active');
            } else if (this.nextPossession === 'red') {
                redSection.classList.add('active');
            }
        }
    }

    updateScoreButtons() {
        // 更新红队得分按钮显示
        document.querySelectorAll('.score-area-left .score-box').forEach(box => {
            const points = parseInt(box.querySelector('.score-display').getAttribute('data-points'));
            box.querySelector('.score-display').textContent = this.roundScores.red[points];
        });

        // 更新蓝队得分按钮显示
        document.querySelectorAll('.score-area-right .score-box').forEach(box => {
            const points = parseInt(box.querySelector('.score-display').getAttribute('data-points'));
            box.querySelector('.score-display').textContent = this.roundScores.blue[points];
        });
    }

    formatTime(time) {
        // 确保 time 是有效数字
        if (typeof time !== 'number' || isNaN(time)) {
            time = 0;
        }
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const milliseconds = Math.floor((time % 1) * 1000);
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }

    endGame() {
        this.isRunning = false;
        this.currentPhase = 'setup';
        alert('比赛结束！');
    }

    startRound() {
        if (this.currentPhase === 'possession') {
            this.currentPhase = 'playing';
            this.shotClock = 20;
            this.roundStartTime = Date.now();
            this.lastPlayedSecond = null;  // 重置倒计时声音状态
            this.playSound(this.roundStartSound);  // 回合开始音
            this.updateDisplay();
        }
    }

    setNextPossession(team) {
        if (this.currentPhase === 'possession') {
            this.currentPossession = team;
            this.updateDisplay();
        }
    }

    // 修改强制重启法
    forceRestart() {
        // 停止所有计时器
        this.isRunning = false;
        
        // 重置所有状态
        this.setupTime = this.defaultSetupTime;
        this.currentMode = '小组循环赛';  // 重置为默认模式
        this.gameTime = this.gameModes['小组循环赛'];
        this.possessionTime = 5;
        this.shotClock = 20;
        this.scores = { blue: 0, red: 0 };
        this.currentPhase = 'setup';
        this.currentPossession = 'red';
        this.roundScores = {
            red: { 2: 0, 3: 0, 7: 0 },
            blue: { 2: 0, 3: 0, 7: 0 }
        };
        this.nextPossession = null;
        this.nextPossessionRequested = null;

        // 清空历史记录
        document.querySelectorAll('.history-section .history-content').forEach(div => {
            div.innerHTML = '';
        });

        // 更新显示
        this.updateDisplay();
        
        // 显示重启提示
        alert('系统已重启！');
    }

    // 修改播放声音的方法
    playSound(sound) {
        // 根据设置决定是否播放声音
        if (sound === this.roundStartSound && !this.soundSettings.roundStartSound) {
            return;  // 如果回合开始声音被禁用，直接返回
        }
        if ((sound === this.countdown3Sound || 
             sound === this.countdown2Sound || 
             sound === this.countdown1Sound || 
             sound === this.countdown0Sound) && 
            !this.soundSettings.countdownSound) {
            return;  // 如果倒计时声音被禁用，直接返回
        }

        sound.currentTime = 0;  // 重置音频到开始
        sound.play();
    }

    // 修改记录犯规的方法
    recordFoul(team) {
        // 添加到历史记录
        const historyEntry = {
            action: `犯规`,
            time: this.formatTime(this.gameTime)
        };
        
        // 添加到对应队伍的历史记录中
        const historyDiv = document.querySelector(`.team-${team} .history-section .history-content`);
        if (historyDiv) {
            const newEntry = document.createElement('div');
            newEntry.style.display = 'flex';
            newEntry.style.justifyContent = 'space-between';
            newEntry.innerHTML = `
                <span>${historyEntry.action}</span>
                <span>${historyEntry.time}</span>
            `;
            historyDiv.appendChild(newEntry);
            
            // 自动滚动到最新记录
            historyDiv.scrollTop = historyDiv.scrollHeight;
        }

        // 切换到占有时间阶段
        this.currentPhase = 'possession';
        this.possessionTime = this.roundPossessionTime;  // 使用10秒的占有时间
        
        // 如果没有预设下一回合，则切换到另一队
        if (!this.nextPossession) {
            this.nextPossession = team === 'red' ? 'blue' : 'red';  // 犯规方的对手获得球权
        }
        
        this.updateDisplay();
        this.playSound(this.roundStartSound);  // 播放回合切换音效
        this.lastPlayedSecond = null;  // 重置倒计时声音状态
    }

    // 修改 addPenaltyScore 方法
    addPenaltyScore(team, points) {
        // 只有在游戏暂停时才能罚球得分
        if (!this.isRunning && (this.currentPhase === 'playing' || this.currentPhase === 'possession')) {
            // 更新总分
            this.scores[team] += points;
            
            // 更新得分次数
            this.roundScores[team][points]++;
            
            // 添加到历史记录
            const historyEntry = {
                action: `罚球得${points}分`,
                time: this.formatTime(this.gameTime)
            };
            
            this.addToHistory(team, historyEntry);
            
            // 切换到占有时间
            this.currentPhase = 'possession';
            this.possessionTime = this.roundPossessionTime;
            
            // 如果没有预设下一回合，则切换到另一队
            if (!this.nextPossession) {
                this.nextPossession = this.currentPossession === 'red' ? 'blue' : 'red';
            }
            
            this.updateDisplay();
            this.playSound(this.roundStartSound);
            this.lastPlayedSecond = null;
        } else {
            // 如果游戏正在运行，显示提示
            alert('请先暂停比赛再进行罚球！');
        }
    }
}

// 等待 DOM 加载完成后再初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing referee system...');
    window.referee = new RefereeSystem();
}); 