System.register("chunks:///_virtual/AudioManager.ts", ['cc'], function (exports) {
  var cclegacy, resources, AudioClip, input, Input, Node, AudioSource;
  return {
    setters: [function (module) {
      cclegacy = module.cclegacy;
      resources = module.resources;
      AudioClip = module.AudioClip;
      input = module.input;
      Input = module.Input;
      Node = module.Node;
      AudioSource = module.AudioSource;
    }],
    execute: function () {
      cclegacy._RF.push({}, "a8778luWUdO9ouPagkDcDVL", "AudioManager", undefined);
      var AudioManager = exports('AudioManager', /*#__PURE__*/function () {
        function AudioManager(parent) {
          this.source = void 0;
          this.boardingClip = null;
          this.unsubscribes = [];
          this.unlockPlaybackDone = false;
          this.pendingStepSounds = 0;
          var audioNode = new Node('AudioManager');
          parent.addChild(audioNode);
          this.source = audioNode.addComponent(AudioSource);
          this.source.volume = 0.85;
        }
        var _proto = AudioManager.prototype;
        _proto.initialize = function initialize(events) {
          var _this = this;
          resources.load('audio/passenger-board', AudioClip, function (error, clip) {
            if (error || !clip) {
              console.warn('[AudioManager] passenger-board sound failed to load', error);
              return;
            }
            _this.boardingClip = clip;
            if (_this.unlockPlaybackDone) {
              _this.flushPendingStepSounds();
            }
          });
          input.on(Input.EventType.TOUCH_START, this.unlockAudio, this);
          input.on(Input.EventType.MOUSE_DOWN, this.unlockAudio, this);
          this.unsubscribes.push(events.on('passenger-boarded', function () {
            return _this.playPassengerStep();
          }));
          this.unsubscribes.push(events.on('passenger-delivered', function () {
            return _this.playPassengerStep();
          }));
          this.unsubscribes.push(events.on('passenger-warning', function () {
            return _this.playWarning();
          }));
        };
        _proto.dispose = function dispose() {
          input.off(Input.EventType.TOUCH_START, this.unlockAudio, this);
          input.off(Input.EventType.MOUSE_DOWN, this.unlockAudio, this);
          this.unsubscribes.splice(0).forEach(function (unsubscribe) {
            return unsubscribe();
          });
        };
        _proto.playPassengerStep = function playPassengerStep() {
          if (!this.boardingClip || !this.unlockPlaybackDone) {
            this.pendingStepSounds = Math.min(3, this.pendingStepSounds + 1);
            return;
          }
          this.source.playOneShot(this.boardingClip, 1);
        };
        _proto.playWarning = function playWarning() {
          if (this.boardingClip && this.unlockPlaybackDone) {
            this.source.playOneShot(this.boardingClip, 0.7);
          }
        };
        _proto.unlockAudio = function unlockAudio() {
          if (this.unlockPlaybackDone) {
            this.flushPendingStepSounds();
            return;
          }
          if (!this.boardingClip) {
            return;
          }
          this.source.playOneShot(this.boardingClip, 0.01);
          this.unlockPlaybackDone = true;
          this.flushPendingStepSounds();
        };
        _proto.flushPendingStepSounds = function flushPendingStepSounds() {
          if (!this.boardingClip || !this.unlockPlaybackDone || this.pendingStepSounds <= 0) {
            return;
          }
          var soundsToPlay = this.pendingStepSounds;
          this.pendingStepSounds = 0;
          for (var index = 0; index < soundsToPlay; index += 1) {
            this.source.playOneShot(this.boardingClip, 1);
          }
        };
        return AudioManager;
      }());
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/EventBus.ts", ['cc'], function (exports) {
  var cclegacy;
  return {
    setters: [function (module) {
      cclegacy = module.cclegacy;
    }],
    execute: function () {
      cclegacy._RF.push({}, "7bad5QHjcxO34eTppvhwDDk", "EventBus", undefined);
      var EventBus = exports('EventBus', /*#__PURE__*/function () {
        function EventBus() {
          this.handlers = new Map();
        }
        var _proto = EventBus.prototype;
        _proto.on = function on(event, handler) {
          var _this$handlers$get;
          var listeners = (_this$handlers$get = this.handlers.get(event)) != null ? _this$handlers$get : new Set();
          listeners.add(handler);
          this.handlers.set(event, listeners);
          return function () {
            return listeners["delete"](handler);
          };
        };
        _proto.emit = function emit(event, payload) {
          var _this$handlers$get2;
          (_this$handlers$get2 = this.handlers.get(event)) == null || _this$handlers$get2.forEach(function (handler) {
            return handler(payload);
          });
        };
        _proto.clear = function clear() {
          this.handlers.clear();
        };
        return EventBus;
      }());
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/GameController.ts", ['cc'], function (exports) {
  var cclegacy, input, Input;
  return {
    setters: [function (module) {
      cclegacy = module.cclegacy;
      input = module.input;
      Input = module.Input;
    }],
    execute: function () {
      cclegacy._RF.push({}, "352a5nrY3pGOLNfXABEtBq3", "GameController", undefined);
      var MAX_WAITING_PASSENGERS = 18;
      var PASSENGER_APPEAR_INTERVAL = 0.18;
      var GameController = exports('GameController', /*#__PURE__*/function () {
        function GameController(manager, view) {
          this.spawnTimer = 0;
          this.passengerAppearTimer = 0;
          this.pendingPassengerSpawns = [];
          this.activeElevatorIndex = 0;
          this.pointerDown = false;
          this.pointerDragged = false;
          this.pointerStartX = 0;
          this.pointerStartY = 0;
          this.pointerLastY = 0;
          this.activePointerSource = null;
          this.ignoreMouseUntil = 0;
          this.lastPointerTime = -Infinity;
          this.lastPointerX = 0;
          this.lastPointerY = 0;
          this.manager = manager;
          this.view = view;
        }
        var _proto = GameController.prototype;
        _proto.start = function start() {
          input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
          input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
          input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
          input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
          input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
          input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
          this.view.render(this.manager.model);
        };
        _proto.update = function update(deltaTime) {
          this.updatePendingPassengerSpawns(deltaTime);
          this.manager.update(deltaTime);
          var model = this.manager.model;
          if (!model.progress.started || model.progress.completed || model.progress.failed) {
            this.view.render(model);
            return;
          }
          this.spawnTimer += deltaTime;
          if (this.spawnTimer >= 3.2) {
            this.spawnTimer = 0;
            this.spawnPassenger();
          }
          this.view.render(model);
        };
        _proto.dispose = function dispose() {
          input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
          input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
          input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
          input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
          input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
          input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
          this.manager.saveNow();
        };
        _proto.onTouchStart = function onTouchStart(event) {
          this.ignoreMouseUntil = Date.now() + 250;
          this.activePointerSource = 'touch';
          var location = event.getUILocation();
          this.beginPointer(location.x, location.y);
        };
        _proto.onTouchMove = function onTouchMove(event) {
          if (this.activePointerSource !== 'touch') {
            return;
          }
          var location = event.getUILocation();
          this.movePointer(location.x, location.y);
        };
        _proto.onTouchEnd = function onTouchEnd(event) {
          if (this.activePointerSource !== 'touch') {
            return;
          }
          var location = event.getUILocation();
          this.endPointer(location.x, location.y);
          this.activePointerSource = null;
          this.ignoreMouseUntil = Date.now() + 250;
        };
        _proto.onMouseDown = function onMouseDown(event) {
          if (Date.now() < this.ignoreMouseUntil) {
            return;
          }
          this.activePointerSource = 'mouse';
          var location = event.getUILocation();
          this.beginPointer(location.x, location.y);
        };
        _proto.onMouseMove = function onMouseMove(event) {
          if (this.activePointerSource !== 'mouse' || Date.now() < this.ignoreMouseUntil) {
            return;
          }
          var location = event.getUILocation();
          this.movePointer(location.x, location.y);
        };
        _proto.onMouseUp = function onMouseUp(event) {
          if (this.activePointerSource !== 'mouse' || Date.now() < this.ignoreMouseUntil) {
            return;
          }
          var location = event.getUILocation();
          this.endPointer(location.x, location.y);
          this.activePointerSource = null;
        };
        _proto.beginPointer = function beginPointer(x, y) {
          this.pointerDown = true;
          this.pointerDragged = false;
          this.pointerStartX = x;
          this.pointerStartY = y;
          this.pointerLastY = y;
        };
        _proto.movePointer = function movePointer(x, y) {
          if (!this.pointerDown || this.manager.model.progress.failed || this.manager.model.progress.completed) {
            return;
          }
          var startPosition = this.view.toLocalPosition(this.pointerStartX, this.pointerStartY);
          if (!this.view.isTowerViewport(startPosition)) {
            return;
          }
          if (Math.abs(x - this.pointerStartX) + Math.abs(y - this.pointerStartY) > 8) {
            this.pointerDragged = true;
          }
          if (this.pointerDragged) {
            this.view.scrollTowerBy(y - this.pointerLastY, this.manager.model.progress.unlockedFloors);
          }
          this.pointerLastY = y;
        };
        _proto.endPointer = function endPointer(x, y) {
          if (!this.pointerDown) {
            return;
          }
          var wasDragged = this.pointerDragged;
          this.pointerDown = false;
          this.pointerDragged = false;
          if (wasDragged) {
            return;
          }
          this.handlePointerOnce(x, y);
        };
        _proto.handlePointerOnce = function handlePointerOnce(x, y) {
          var now = Date.now();
          var isDuplicate = now - this.lastPointerTime < 120 && Math.abs(x - this.lastPointerX) < 2 && Math.abs(y - this.lastPointerY) < 2;
          if (isDuplicate) {
            return;
          }
          this.lastPointerTime = now;
          this.lastPointerX = x;
          this.lastPointerY = y;
          this.handlePointer(x, y);
        };
        _proto.handlePointer = function handlePointer(x, y) {
          var position = this.view.toLocalPosition(x, y);
          if (this.manager.model.progress.failed) {
            if (this.view.isRestartButton(position)) {
              this.manager.model.restartGame();
              this.spawnTimer = 0;
              this.passengerAppearTimer = 0;
              this.pendingPassengerSpawns.length = 0;
              this.view.resetTowerScroll();
              this.view.setInteractionMessage('准备重新开始，点击开始运营');
              this.manager.saveNow();
            }
            return;
          }
          if (this.manager.model.progress.completed) {
            var upgrade = this.view.upgradeAt(position);
            if (upgrade) {
              this.manager.model.chooseUpgrade(upgrade);
              this.spawnTimer = 0;
              this.passengerAppearTimer = 0;
              this.pendingPassengerSpawns.length = 0;
              this.manager.saveNow();
              this.view.setInteractionMessage('升级完成，点击开始下一天');
            }
            return;
          }
          if (!this.manager.model.progress.started) {
            if (this.view.isStartButton(position)) {
              this.manager.model.startRun();
              this.spawnTimer = 0;
              this.passengerAppearTimer = 0;
              this.pendingPassengerSpawns.length = 0;
              this.seedPassengers();
              this.view.setInteractionMessage('运营开始，先选择 S1 或 S2 再点击楼层');
              this.manager.saveNow();
            } else if (this.view.isBuildButton(position)) {
              var built = this.manager.model.extendFloor();
              this.view.setInteractionMessage(built ? '新楼层已解锁，可上下拖动浏览' : '金币不足');
            } else {
              this.view.setInteractionMessage('点击开始运营后，乘客才会出现和倒计时');
            }
            return;
          }
          if (this.view.isMenuButton(position)) {
            this.manager.saveNow();
            this.view.toggleMenu();
            this.view.setInteractionMessage(this.view.isMenuOpen ? '已打开运营菜单' : '继续运营');
            return;
          }
          if (this.view.isMenuOpen) {
            return;
          }
          var cabinIndex = this.view.cabinAt(position);
          if (cabinIndex !== null) {
            var model = this.manager.model;
            this.activeElevatorIndex = cabinIndex;
            this.view.setActiveElevator(cabinIndex);
            var elevator = model.elevators[cabinIndex];
            var boarded = model.boardAtElevator(cabinIndex);
            var message = boarded > 0 ? elevator.id + "\uFF1A" + boarded + " \u540D\u4E58\u5BA2\u6B63\u5728\u4F9D\u6B21\u4E0A\u8F66" : elevator.targetFloor !== null ? elevator.id + " \u6B63\u5728\u524D\u5F80 " + elevator.targetFloor + " \u5C42" : model.isBoarding ? '乘客正在依次进入，请点击目标楼层排队' : model.isElevatorFullAt(cabinIndex) ? elevator.id + " \u5DF2\u6EE1\uFF0C\u5269\u4F59\u4E58\u5BA2\u4F1A\u7EE7\u7EED\u6392\u961F\u7B49\u53E6\u4E00\u90E8\u7535\u68AF" : "\u5DF2\u9009\u4E2D " + elevator.id + "\uFF0C\u70B9\u51FB\u697C\u5C42\u7ED9\u5B83\u8FFD\u52A0\u6307\u4EE4";
            this.view.setInteractionMessage(message);
            return;
          }
          if (this.view.isBuildButton(position)) {
            var _built = this.manager.model.extendFloor();
            this.view.setInteractionMessage(_built ? '新楼层已解锁，可上下拖动浏览' : '金币不足');
            return;
          }
          var floor = this.view.floorAt(position);
          if (floor !== null) {
            var _model = this.manager.model;
            var elevatorIndex = this.activeElevatorIndex;
            var _elevator = _model.elevators[elevatorIndex];
            var queued = _model.queueFloorForElevator(floor, elevatorIndex);
            if (!queued && _elevator.targetFloor === null && floor === _elevator.currentFloor) {
              this.view.setInteractionMessage(_elevator.id + " \u5DF2\u5728 " + floor + " \u5C42");
            } else if (!queued) {
              this.view.setInteractionMessage("\u65E0\u6CD5\u52A0\u5165 " + floor + " \u5C42\u6307\u4EE4");
            } else if (_model.isBoarding) {
              this.view.setInteractionMessage(_elevator.id + " \u5DF2\u52A0\u5165 " + floor + " \u5C42\uFF0C\u7B49\u5F85\u4E58\u5BA2\u4F9D\u6B21\u4E0A\u8F66\u540E\u51FA\u53D1");
            } else {
              var pending = _elevator.queue.length;
              this.view.setInteractionMessage(pending > 0 ? _elevator.id + " \u5DF2\u8FFD\u52A0 " + floor + " \u5C42\uFF0C\u524D\u65B9\u8FD8\u6709 " + pending + " \u4E2A\u505C\u7AD9\u6307\u4EE4" : _elevator.id + " \u6B63\u5728\u524D\u5F80 " + floor + " \u5C42");
            }
            return;
          }
          this.view.setInteractionMessage('请点击楼层区域或电梯轿厢');
        };
        _proto.seedPassengers = function seedPassengers() {
          if (this.manager.model.waitingPassengers.length > 0) {
            return;
          }
          this.createPassengerBatch(0, 4);
          this.createPassengerBatch(1, 1);
          this.createPassengerBatch(2, 1);
        };
        _proto.spawnPassenger = function spawnPassenger() {
          var waitingCount = this.manager.model.waitingPassengers.length + this.pendingPassengerSpawns.length;
          if (waitingCount >= MAX_WAITING_PASSENGERS) {
            return;
          }
          var origin = this.pickPassengerOrigin();
          var room = MAX_WAITING_PASSENGERS - waitingCount;
          var requestedCount = origin === 0 ? 2 + Math.floor(Math.random() * 3) : 1;
          this.createPassengerBatch(origin, Math.min(room, requestedCount));
        };
        _proto.createPassengerBatch = function createPassengerBatch(origin, count) {
          var floorCount = this.manager.model.progress.unlockedFloors;
          var created = 0;
          for (var index = 0; index < count; index += 1) {
            var destination = Math.floor(Math.random() * floorCount);
            while (destination === origin) {
              destination = Math.floor(Math.random() * floorCount);
            }
            this.pendingPassengerSpawns.push({
              origin: origin,
              destination: destination
            });
            created += 1;
          }
          this.view.showQueueIncrease(origin, created);
          return created;
        };
        _proto.updatePendingPassengerSpawns = function updatePendingPassengerSpawns(deltaTime) {
          if (!this.manager.model.progress.started || this.pendingPassengerSpawns.length === 0) {
            this.passengerAppearTimer = 0;
            return;
          }
          this.passengerAppearTimer += deltaTime;
          while (this.pendingPassengerSpawns.length > 0) {
            var interval = this.manager.model.waitingPassengers.length === 0 ? 0 : PASSENGER_APPEAR_INTERVAL;
            if (this.passengerAppearTimer < interval) {
              return;
            }
            this.passengerAppearTimer = interval === 0 ? 0 : this.passengerAppearTimer - interval;
            var spawn = this.pendingPassengerSpawns.shift();
            if (!spawn) {
              return;
            }
            this.manager.model.createPassenger(spawn.origin, spawn.destination);
          }
        };
        _proto.pickPassengerOrigin = function pickPassengerOrigin() {
          var floorCount = this.manager.model.progress.unlockedFloors;
          if (floorCount <= 1) {
            return 0;
          }
          if (Math.random() < 0.55) {
            return 0;
          }
          return 1 + Math.floor(Math.random() * (floorCount - 1));
        };
        return GameController;
      }());
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/GameManager.ts", ['cc', './EventBus.ts', './GameModel.ts', './PlatformManager.ts', './StorageManager.ts'], function (exports) {
  var cclegacy, EventBus, GameModel, PlatformManager, StorageManager;
  return {
    setters: [function (module) {
      cclegacy = module.cclegacy;
    }, function (module) {
      EventBus = module.EventBus;
    }, function (module) {
      GameModel = module.GameModel;
    }, function (module) {
      PlatformManager = module.PlatformManager;
    }, function (module) {
      StorageManager = module.StorageManager;
    }],
    execute: function () {
      cclegacy._RF.push({}, "9f6c3Oqnt5K7rkUcn44qXNa", "GameManager", undefined);
      var GameManager = exports('GameManager', /*#__PURE__*/function () {
        function GameManager() {
          this.events = new EventBus();
          this.model = new GameModel();
          this.storage = new StorageManager();
          this.platform = new PlatformManager();
          this.saveTimer = 0;
        }
        var _proto = GameManager.prototype;
        _proto.initialize = function initialize() {
          this.model.restore(this.storage.load());
          void this.platform.service.login()["catch"](function () {
            return undefined;
          });
        };
        _proto.update = function update(deltaTime) {
          var _this = this;
          this.model.update(deltaTime);
          this.model.drainBoardedEvents().forEach(function (event) {
            _this.events.emit('passenger-boarded', event);
          });
          this.model.drainDeliveredEvents().forEach(function (event) {
            _this.events.emit('passenger-delivered', event);
          });
          this.model.drainWarningEvents().forEach(function (event) {
            _this.events.emit('passenger-warning', event);
          });
          this.saveTimer += deltaTime;
          if (this.saveTimer >= 5) {
            this.saveTimer = 0;
            this.storage.save(this.model.snapshot());
          }
        };
        _proto.saveNow = function saveNow() {
          this.storage.save(this.model.snapshot());
        };
        return GameManager;
      }());
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/GameModel.ts", ['./rollupPluginModLoBabelHelpers.js', 'cc', './GameTypes.ts'], function (exports) {
  var _extends, _createForOfIteratorHelperLoose, _createClass, cclegacy, PassengerState, UpgradeType, ElevatorDirection;
  return {
    setters: [function (module) {
      _extends = module.extends;
      _createForOfIteratorHelperLoose = module.createForOfIteratorHelperLoose;
      _createClass = module.createClass;
    }, function (module) {
      cclegacy = module.cclegacy;
    }, function (module) {
      PassengerState = module.PassengerState;
      UpgradeType = module.UpgradeType;
      ElevatorDirection = module.ElevatorDirection;
    }],
    execute: function () {
      cclegacy._RF.push({}, "520dfJ7ysZI4qRalzSiFizg", "GameModel", undefined);
      var MIN_FLOORS = 3;
      var BOARDING_INTERVAL = 0.22;
      var UNLOADING_INTERVAL = 0.28;
      var PASSENGER_WAIT_SECONDS = 40;
      var PATIENCE_RING_RATIO = 0.5;
      var PATIENCE_WARNING_RATIO = 0.75;
      var WARNING_SOUND_INTERVAL = 0.8;
      var ELEVATOR_COUNT = 2;
      var DELIVERY_SCORE_BASE = 10;
      var GameModel = exports('GameModel', /*#__PURE__*/function () {
        function GameModel() {
          this.passengers = [];
          this.elevators = [{
            id: 'S1',
            currentFloor: 0,
            targetFloor: null,
            position: 0,
            direction: ElevatorDirection.Idle,
            capacity: 6,
            passengers: [],
            queue: [],
            doorOpen: true
          }, {
            id: 'S2',
            currentFloor: 0,
            targetFloor: null,
            position: 0,
            direction: ElevatorDirection.Idle,
            capacity: 6,
            passengers: [],
            queue: [],
            doorOpen: true
          }];
          this.elevator2 = this.elevators[1];
          this.economy = {
            coins: 20,
            stars: 0,
            score: 0,
            bestScore: 0,
            delivered: 0,
            lost: 0,
            multiplier: 1,
            multiplierProgress: 0
          };
          this.progress = {
            day: 1,
            level: 1,
            targetDeliveries: 12,
            unlockedFloors: MIN_FLOORS,
            elapsedSeconds: 0,
            started: false,
            completed: false,
            failed: false
          };
          this.upgrades = {
            capacityLevel: 0,
            speedLevel: 0,
            patienceLevel: 0
          };
          this.nextPassengerId = 1;
          this.boardingQueues = Array.from({
            length: ELEVATOR_COUNT
          }, function () {
            return [];
          });
          this.unloadingQueues = Array.from({
            length: ELEVATOR_COUNT
          }, function () {
            return [];
          });
          this.boardedEvents = [];
          this.deliveredEvents = [];
          this.warningEvents = [];
          this.boardingTimers = Array.from({
            length: ELEVATOR_COUNT
          }, function () {
            return 0;
          });
          this.unloadingTimers = Array.from({
            length: ELEVATOR_COUNT
          }, function () {
            return 0;
          });
          this.warningTimer = 0;
          this.pendingArrivalDirections = Array.from({
            length: ELEVATOR_COUNT
          }, function () {
            return null;
          });
          this.stopDeliveredCounts = Array.from({
            length: ELEVATOR_COUNT
          }, function () {
            return 0;
          });
        }
        var _proto = GameModel.prototype;
        _proto.restore = function restore(snapshot) {
          var _snapshot$upgrades, _this$economy, _this$economy$score, _this$economy2, _this$economy2$bestSc, _this$progress, _this$progress$starte;
          if (!snapshot || snapshot.version !== 1) {
            return;
          }
          Object.assign(this.economy, snapshot.economy);
          Object.assign(this.progress, snapshot.progress);
          Object.assign(this.upgrades, (_snapshot$upgrades = snapshot.upgrades) != null ? _snapshot$upgrades : {});
          (_this$economy$score = (_this$economy = this.economy).score) != null ? _this$economy$score : _this$economy.score = 0;
          (_this$economy2$bestSc = (_this$economy2 = this.economy).bestScore) != null ? _this$economy2$bestSc : _this$economy2.bestScore = this.economy.score;
          (_this$progress$starte = (_this$progress = this.progress).started) != null ? _this$progress$starte : _this$progress.started = false;
          this.applyUpgradeEffects();
          this.progress.completed = false;
          this.progress.failed = false;
        };
        _proto.snapshot = function snapshot() {
          return {
            version: 1,
            economy: _extends({}, this.economy),
            progress: _extends({}, this.progress),
            upgrades: _extends({}, this.upgrades)
          };
        };
        _proto.createPassenger = function createPassenger(originFloor, destinationFloor) {
          var maxPatience = PASSENGER_WAIT_SECONDS + this.upgrades.patienceLevel * 4;
          var passenger = {
            id: this.nextPassengerId++,
            originFloor: originFloor,
            destinationFloor: destinationFloor,
            waitElapsed: 0,
            patience: maxPatience,
            maxPatience: maxPatience,
            state: PassengerState.Waiting
          };
          this.passengers.push(passenger);
          return passenger;
        };
        _proto.getPassenger = function getPassenger(id) {
          return this.passengers.find(function (passenger) {
            return passenger.id === id;
          });
        };
        _proto.getPassengerWaitProgress = function getPassengerWaitProgress(passenger) {
          return Math.max(0, Math.min(1, passenger.waitElapsed / passenger.maxPatience));
        };
        _proto.shouldShowPassengerTimer = function shouldShowPassengerTimer(passenger) {
          return passenger.waitElapsed / passenger.maxPatience >= PATIENCE_RING_RATIO;
        };
        _proto.elevatorOccupancyAt = function elevatorOccupancyAt(elevatorIndex) {
          var elevator = this.elevators[elevatorIndex];
          if (!elevator) {
            return 0;
          }
          return elevator.passengers.length + this.boardingQueues[elevatorIndex].length;
        };
        _proto.isElevatorFullAt = function isElevatorFullAt(elevatorIndex) {
          var elevator = this.elevators[elevatorIndex];
          return !!elevator && this.elevatorOccupancyAt(elevatorIndex) >= elevator.capacity;
        };
        _proto.getFloorQueue = function getFloorQueue(floor) {
          return this.passengers.filter(function (passenger) {
            return passenger.originFloor === floor && passenger.state === PassengerState.Waiting;
          }).sort(function (left, right) {
            return left.id - right.id;
          });
        };
        _proto.getFloorLine = function getFloorLine(floor) {
          return this.passengers.filter(function (passenger) {
            return passenger.originFloor === floor && (passenger.state === PassengerState.Waiting || passenger.state === PassengerState.Boarding);
          }).sort(function (left, right) {
            return left.id - right.id;
          });
        };
        _proto.getPassengerBoardingElevatorIndex = function getPassengerBoardingElevatorIndex(passenger) {
          if (passenger.state !== PassengerState.Boarding) {
            return null;
          }
          var index = this.boardingQueues.findIndex(function (queue) {
            return queue.includes(passenger.id);
          });
          return index < 0 ? null : index;
        };
        _proto.getPassengerBoardingProgress = function getPassengerBoardingProgress(passenger) {
          var elevatorIndex = this.getPassengerBoardingElevatorIndex(passenger);
          if (elevatorIndex === null || this.boardingQueues[elevatorIndex][0] !== passenger.id) {
            return 0;
          }
          return Math.max(0, Math.min(1, this.boardingTimers[elevatorIndex] / BOARDING_INTERVAL));
        };
        _proto.drainBoardedEvents = function drainBoardedEvents() {
          return this.boardedEvents.splice(0);
        };
        _proto.drainDeliveredEvents = function drainDeliveredEvents() {
          return this.deliveredEvents.splice(0);
        };
        _proto.drainWarningEvents = function drainWarningEvents() {
          return this.warningEvents.splice(0);
        };
        _proto.queueFloor = function queueFloor(floor) {
          return this.queueFloorForElevator(floor, 0);
        };
        _proto.queueFloorForElevator = function queueFloorForElevator(floor, elevatorIndex) {
          var elevator = this.elevators[elevatorIndex];
          if (floor < 0 || floor >= this.progress.unlockedFloors) {
            return false;
          }
          if (!elevator) {
            return false;
          }
          if (elevator.targetFloor === null && floor === elevator.currentFloor) {
            elevator.doorOpen = true;
            return false;
          }
          return this.enqueueStops([floor], elevatorIndex);
        };
        _proto.startRun = function startRun() {
          if (this.progress.completed || this.progress.failed) {
            return;
          }
          this.progress.started = true;
        };
        _proto.boardAtCurrentFloor = function boardAtCurrentFloor() {
          return this.boardAtElevator(0);
        };
        _proto.boardAtElevator = function boardAtElevator(elevatorIndex) {
          var _this = this;
          var boarded = this.boardPassengersAtCurrentFloor(elevatorIndex, function () {
            return true;
          });
          var elevator = this.elevators[elevatorIndex];
          if (!elevator || this.elevatorOccupancyAt(elevatorIndex) < elevator.capacity) {
            return boarded;
          }
          var overflowIndex = this.elevators.findIndex(function (other, index) {
            return index !== elevatorIndex && other.currentFloor === elevator.currentFloor && Math.abs(other.position - elevator.position) < 0.001 && other.doorOpen && _this.unloadingQueues[index].length === 0 && !_this.isElevatorFullAt(index);
          });
          if (overflowIndex < 0) {
            return boarded;
          }
          return boarded + this.boardPassengersAtCurrentFloor(overflowIndex, function () {
            return true;
          });
        };
        _proto.update = function update(deltaTime) {
          var _this2 = this;
          if (!this.progress.started || this.progress.completed || this.progress.failed) {
            return;
          }
          this.progress.elapsedSeconds += deltaTime;
          this.updatePatience(deltaTime);
          if (this.progress.failed) {
            return;
          }
          this.updatePatienceWarnings(deltaTime);
          this.elevators.forEach(function (_elevator, index) {
            _this2.updateUnloading(deltaTime, index);
            _this2.updateBoarding(deltaTime, index);
            _this2.updateElevator(deltaTime, index);
          });
          this.progress.completed = this.economy.delivered >= this.progress.targetDeliveries && this.unloadingQueues.every(function (queue) {
            return queue.length === 0;
          });
        };
        _proto.extendFloor = function extendFloor() {
          var cost = this.floorExtensionCost;
          if (this.economy.coins < cost) {
            return false;
          }
          this.economy.coins -= cost;
          this.progress.unlockedFloors += 1;
          return true;
        };
        _proto.chooseUpgrade = function chooseUpgrade(type) {
          if (!this.progress.completed) {
            return;
          }
          if (type === UpgradeType.Capacity) {
            this.upgrades.capacityLevel += 1;
          } else if (type === UpgradeType.Speed) {
            this.upgrades.speedLevel += 1;
          } else {
            this.upgrades.patienceLevel += 1;
          }
          this.economy.stars += 1;
          this.economy.coins += 10 + this.progress.level * 2;
          this.applyUpgradeEffects();
          this.startNextDay();
        };
        _proto.restartGame = function restartGame() {
          this.passengers.length = 0;
          this.resetElevatorAndQueues();
          this.nextPassengerId = 1;
          this.economy.delivered = 0;
          this.economy.lost = 0;
          this.economy.score = 0;
          this.economy.multiplier = 1;
          this.economy.multiplierProgress = 0;
          this.progress.elapsedSeconds = 0;
          this.progress.started = false;
          this.progress.completed = false;
          this.progress.failed = false;
          this.applyUpgradeEffects();
        };
        _proto.updatePatience = function updatePatience(deltaTime) {
          for (var _iterator = _createForOfIteratorHelperLoose(this.waitingPassengers), _step; !(_step = _iterator()).done;) {
            var _passenger = _step.value;
            _passenger.waitElapsed += deltaTime;
            _passenger.patience = Math.max(0, _passenger.maxPatience - _passenger.waitElapsed);
            if (_passenger.waitElapsed < _passenger.maxPatience) {
              continue;
            }
            _passenger.patience = 0;
            _passenger.state = PassengerState.Lost;
            this.economy.lost += 1;
            this.economy.multiplier = 1;
            this.economy.multiplierProgress = 0;
            this.progress.failed = true;
            return;
          }
        };
        _proto.updatePatienceWarnings = function updatePatienceWarnings(deltaTime) {
          var _this3 = this;
          var warningFloors = this.warningFloors;
          if (warningFloors.length === 0) {
            this.warningTimer = 0;
            return;
          }
          this.warningTimer += deltaTime;
          if (this.warningTimer < WARNING_SOUND_INTERVAL) {
            return;
          }
          this.warningTimer %= WARNING_SOUND_INTERVAL;
          warningFloors.forEach(function (floor) {
            return _this3.warningEvents.push({
              floor: floor
            });
          });
        };
        _proto.updateElevator = function updateElevator(deltaTime, elevatorIndex) {
          var elevator = this.elevators[elevatorIndex];
          if (elevator.targetFloor === null) {
            this.startNextStop(elevatorIndex);
            return;
          }
          var difference = elevator.targetFloor - elevator.position;
          var step = Math.sign(difference) * deltaTime * this.elevatorSpeed;
          if (Math.abs(difference) > Math.abs(step)) {
            elevator.position += step;
            elevator.doorOpen = false;
            return;
          }
          var arrivalDirection = elevator.direction;
          elevator.position = elevator.targetFloor;
          elevator.currentFloor = elevator.targetFloor;
          elevator.targetFloor = null;
          elevator.direction = ElevatorDirection.Idle;
          elevator.doorOpen = true;
          if (!this.beginUnloadingAtCurrentFloor(elevatorIndex, arrivalDirection)) {
            this.boardForArrivalDirection(elevatorIndex, arrivalDirection);
          }
        };
        _proto.updateBoarding = function updateBoarding(deltaTime, elevatorIndex) {
          var boardingQueue = this.boardingQueues[elevatorIndex];
          if (boardingQueue.length === 0) {
            this.boardingTimers[elevatorIndex] = 0;
            return;
          }
          this.boardingTimers[elevatorIndex] += deltaTime;
          while (this.boardingTimers[elevatorIndex] >= BOARDING_INTERVAL && boardingQueue.length > 0) {
            this.boardingTimers[elevatorIndex] -= BOARDING_INTERVAL;
            var passengerId = boardingQueue.shift();
            var _passenger2 = passengerId === undefined ? undefined : this.getPassenger(passengerId);
            if (!_passenger2 || _passenger2.state !== PassengerState.Boarding) {
              continue;
            }
            _passenger2.state = PassengerState.Riding;
            this.elevators[elevatorIndex].passengers.push(_passenger2.id);
            this.boardedEvents.push({
              passengerId: _passenger2.id,
              destinationFloor: _passenger2.destinationFloor,
              elevatorIndex: elevatorIndex
            });
          }
        };
        _proto.beginUnloadingAtCurrentFloor = function beginUnloadingAtCurrentFloor(elevatorIndex, arrivalDirection) {
          var _this4 = this;
          var elevator = this.elevators[elevatorIndex];
          var unloadingQueue = this.unloadingQueues[elevatorIndex];
          var deliveredIds = elevator.passengers.filter(function (id) {
            var _this4$getPassenger;
            return ((_this4$getPassenger = _this4.getPassenger(id)) == null ? void 0 : _this4$getPassenger.destinationFloor) === elevator.currentFloor;
          });
          if (deliveredIds.length === 0) {
            return false;
          }
          deliveredIds.forEach(function (id) {
            var passenger = _this4.getPassenger(id);
            if (passenger) {
              passenger.state = PassengerState.Exiting;
              unloadingQueue.push(id);
            }
          });
          this.pendingArrivalDirections[elevatorIndex] = arrivalDirection;
          this.stopDeliveredCounts[elevatorIndex] = 0;
          this.unloadingTimers[elevatorIndex] = 0;
          return unloadingQueue.length > 0;
        };
        _proto.updateUnloading = function updateUnloading(deltaTime, elevatorIndex) {
          var _this5 = this;
          var unloadingQueue = this.unloadingQueues[elevatorIndex];
          if (unloadingQueue.length === 0) {
            this.unloadingTimers[elevatorIndex] = 0;
            return;
          }
          this.unloadingTimers[elevatorIndex] += deltaTime;
          var _loop = function _loop() {
            _this5.unloadingTimers[elevatorIndex] -= UNLOADING_INTERVAL;
            var passengerId = unloadingQueue.shift();
            var passenger = passengerId === undefined ? undefined : _this5.getPassenger(passengerId);
            if (!passenger || passenger.state !== PassengerState.Exiting) {
              return 1; // continue
            }

            passenger.state = PassengerState.Delivered;
            var elevator = _this5.elevators[elevatorIndex];
            elevator.passengers = elevator.passengers.filter(function (id) {
              return id !== passenger.id;
            });
            var patienceRatio = passenger.patience / passenger.maxPatience;
            _this5.economy.multiplierProgress += patienceRatio >= 0.6 ? 2 : 1;
            _this5.economy.delivered += 1;
            _this5.economy.coins += _this5.economy.multiplier;
            var quickDeliveryBonus = patienceRatio >= 0.6 ? 1.5 : 1;
            var scoreGain = Math.round(DELIVERY_SCORE_BASE * _this5.economy.multiplier * quickDeliveryBonus);
            _this5.economy.score += scoreGain;
            _this5.economy.bestScore = Math.max(_this5.economy.bestScore, _this5.economy.score);
            _this5.stopDeliveredCounts[elevatorIndex] += 1;
            _this5.deliveredEvents.push({
              passengerId: passenger.id,
              floor: elevator.currentFloor,
              stopDeliveredCount: _this5.stopDeliveredCounts[elevatorIndex],
              totalDelivered: _this5.economy.delivered,
              elevatorIndex: elevatorIndex
            });
          };
          while (this.unloadingTimers[elevatorIndex] >= UNLOADING_INTERVAL && unloadingQueue.length > 0) {
            if (_loop()) continue;
          }
          if (this.economy.multiplierProgress >= 8) {
            this.economy.multiplier = Math.min(3, this.economy.multiplier + 1);
            this.economy.multiplierProgress = 0;
          }
          if (unloadingQueue.length === 0 && this.pendingArrivalDirections[elevatorIndex] !== null) {
            var arrivalDirection = this.pendingArrivalDirections[elevatorIndex];
            this.pendingArrivalDirections[elevatorIndex] = null;
            this.boardForArrivalDirection(elevatorIndex, arrivalDirection);
          }
        };
        _proto.boardForArrivalDirection = function boardForArrivalDirection(elevatorIndex, arrivalDirection) {
          this.boardPassengersAtCurrentFloor(elevatorIndex, function (passenger) {
            return Math.sign(passenger.destinationFloor - passenger.originFloor) === arrivalDirection;
          });
        };
        _proto.applyUpgradeEffects = function applyUpgradeEffects() {
          var _this6 = this;
          this.elevators.forEach(function (elevator) {
            elevator.capacity = 6 + _this6.upgrades.capacityLevel;
          });
        };
        _proto.boardPassengersAtCurrentFloor = function boardPassengersAtCurrentFloor(elevatorIndex, predicate) {
          var _this7 = this;
          var elevator = this.elevators[elevatorIndex];
          if (!elevator || !elevator.doorOpen || this.unloadingQueues[elevatorIndex].length > 0) {
            return 0;
          }
          var room = elevator.capacity - this.elevatorOccupancyAt(elevatorIndex);
          if (room <= 0) {
            return 0;
          }
          var boarding = [];
          var floorQueue = this.getFloorQueue(elevator.currentFloor);
          for (var _iterator2 = _createForOfIteratorHelperLoose(floorQueue), _step2; !(_step2 = _iterator2()).done;) {
            var _passenger3 = _step2.value;
            if (boarding.length >= room) {
              break;
            }
            // A strict FIFO queue cannot skip a passenger whose direction is incompatible.
            if (!predicate(_passenger3)) {
              break;
            }
            boarding.push(_passenger3);
          }
          boarding.forEach(function (passenger) {
            passenger.state = PassengerState.Boarding;
            _this7.boardingQueues[elevatorIndex].push(passenger.id);
          });
          return boarding.length;
        };
        _proto.enqueueStops = function enqueueStops(floors, elevatorIndex) {
          var _this8 = this;
          var elevator = this.elevators[elevatorIndex];
          var added = false;
          floors.forEach(function (floor) {
            if (floor < 0 || floor >= _this8.progress.unlockedFloors) {
              return;
            }
            elevator.queue.push(floor);
            added = true;
          });
          this.startNextStop(elevatorIndex);
          return added;
        };
        _proto.startNextStop = function startNextStop(elevatorIndex) {
          var elevator = this.elevators[elevatorIndex];
          if (elevator.targetFloor !== null || this.boardingQueues[elevatorIndex].length > 0 || this.unloadingQueues[elevatorIndex].length > 0) {
            return;
          }
          while (elevator.queue.length > 0) {
            var next = elevator.queue.shift();
            if (next === undefined) {
              return;
            }
            if (next === elevator.currentFloor) {
              elevator.doorOpen = true;
              continue;
            }
            elevator.targetFloor = next;
            elevator.direction = next > elevator.currentFloor ? ElevatorDirection.Up : ElevatorDirection.Down;
            elevator.doorOpen = false;
            return;
          }
          elevator.direction = ElevatorDirection.Idle;
        };
        _proto.startNextDay = function startNextDay() {
          this.passengers.length = 0;
          this.resetElevatorAndQueues();
          this.progress.day += 1;
          this.progress.level += 1;
          this.progress.targetDeliveries += 6;
          this.progress.elapsedSeconds = 0;
          this.progress.started = false;
          this.progress.completed = false;
          this.progress.failed = false;
          this.economy.delivered = 0;
          this.economy.lost = 0;
          this.economy.score = 0;
          this.economy.multiplier = 1;
          this.economy.multiplierProgress = 0;
        };
        _proto.resetElevatorAndQueues = function resetElevatorAndQueues() {
          this.elevators.forEach(function (elevator) {
            elevator.currentFloor = 0;
            elevator.targetFloor = null;
            elevator.position = 0;
            elevator.direction = ElevatorDirection.Idle;
            elevator.passengers = [];
            elevator.queue = [];
            elevator.doorOpen = true;
          });
          this.boardingQueues.forEach(function (queue) {
            queue.length = 0;
          });
          this.unloadingQueues.forEach(function (queue) {
            queue.length = 0;
          });
          this.boardedEvents.length = 0;
          this.deliveredEvents.length = 0;
          this.warningEvents.length = 0;
          this.boardingTimers.fill(0);
          this.unloadingTimers.fill(0);
          this.warningTimer = 0;
          this.pendingArrivalDirections.fill(null);
          this.stopDeliveredCounts.fill(0);
        };
        _createClass(GameModel, [{
          key: "elevator",
          get: function get() {
            return this.elevators[0];
          }
        }, {
          key: "waitingPassengers",
          get: function get() {
            return this.passengers.filter(function (passenger) {
              return passenger.state === PassengerState.Waiting;
            });
          }
        }, {
          key: "warningFloors",
          get: function get() {
            return [].concat(new Set(this.waitingPassengers.filter(function (passenger) {
              return passenger.waitElapsed / passenger.maxPatience >= PATIENCE_WARNING_RATIO;
            }).map(function (passenger) {
              return passenger.originFloor;
            })));
          }
        }, {
          key: "elevatorOccupancy",
          get: function get() {
            return this.elevatorOccupancyAt(0);
          }
        }, {
          key: "isElevatorFull",
          get: function get() {
            return this.isElevatorFullAt(0);
          }
        }, {
          key: "isBoarding",
          get: function get() {
            return this.boardingQueues.some(function (queue) {
              return queue.length > 0;
            });
          }
        }, {
          key: "isUnloading",
          get: function get() {
            return this.unloadingQueues.some(function (queue) {
              return queue.length > 0;
            });
          }
        }, {
          key: "isElevatorMoving",
          get: function get() {
            return this.elevators.some(function (elevator) {
              return elevator.targetFloor !== null;
            });
          }
        }, {
          key: "floorExtensionCost",
          get: function get() {
            return 10 + (this.progress.unlockedFloors - MIN_FLOORS) * 10;
          }
        }, {
          key: "elevatorSpeed",
          get: function get() {
            return 1.25 + this.upgrades.speedLevel * 0.18;
          }
        }]);
        return GameModel;
      }());
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/GameRoot.ts", ['./rollupPluginModLoBabelHelpers.js', 'cc', './GameController.ts', './AudioManager.ts', './GameManager.ts', './GameView.ts'], function (exports) {
  var _inheritsLoose, cclegacy, _decorator, view, ResolutionPolicy, game, Node, Layers, UITransform, Camera, Canvas, director, Director, Component, GameController, AudioManager, GameManager, GameView;
  return {
    setters: [function (module) {
      _inheritsLoose = module.inheritsLoose;
    }, function (module) {
      cclegacy = module.cclegacy;
      _decorator = module._decorator;
      view = module.view;
      ResolutionPolicy = module.ResolutionPolicy;
      game = module.game;
      Node = module.Node;
      Layers = module.Layers;
      UITransform = module.UITransform;
      Camera = module.Camera;
      Canvas = module.Canvas;
      director = module.director;
      Director = module.Director;
      Component = module.Component;
    }, function (module) {
      GameController = module.GameController;
    }, function (module) {
      AudioManager = module.AudioManager;
    }, function (module) {
      GameManager = module.GameManager;
    }, function (module) {
      GameView = module.GameView;
    }],
    execute: function () {
      var _dec, _class;
      cclegacy._RF.push({}, "98dcdQl8GhEYLJRG8ap+Eh+", "GameRoot", undefined);
      var ccclass = _decorator.ccclass;
      var GameRoot = exports('GameRoot', (_dec = ccclass('GameRoot'), _dec(_class = /*#__PURE__*/function (_Component) {
        _inheritsLoose(GameRoot, _Component);
        function GameRoot() {
          var _this;
          for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }
          _this = _Component.call.apply(_Component, [this].concat(args)) || this;
          _this.controller = null;
          _this.audioManager = null;
          return _this;
        }
        var _proto = GameRoot.prototype;
        _proto.onLoad = function onLoad() {
          // Keep both elevator shafts visible on narrow preview windows and phones.
          view.setDesignResolutionSize(720, 1280, ResolutionPolicy.SHOW_ALL);
          game.frameRate = 60;
          var canvasNode = new Node('Canvas');
          canvasNode.layer = Layers.Enum.UI_2D;
          this.node.addChild(canvasNode);
          canvasNode.addComponent(UITransform).setContentSize(720, 1280);
          var cameraNode = new Node('UICamera');
          cameraNode.layer = Layers.Enum.UI_2D;
          cameraNode.setPosition(0, 0, 1000);
          canvasNode.addChild(cameraNode);
          var camera = cameraNode.addComponent(Camera);
          camera.projection = Camera.ProjectionType.ORTHO;
          camera.orthoHeight = 640;
          camera.visibility = Layers.Enum.UI_2D;
          var canvas = canvasNode.addComponent(Canvas);
          canvas.cameraComponent = camera;
          var manager = new GameManager();
          manager.initialize();
          this.audioManager = new AudioManager(canvasNode);
          this.audioManager.initialize(manager.events);
          var gameView = new GameView(canvasNode, manager.events);
          this.controller = new GameController(manager, gameView);
          this.controller.start();
          director.on(Director.EVENT_BEFORE_SCENE_LAUNCH, manager.saveNow, manager);
        };
        _proto.update = function update(deltaTime) {
          var _this$controller;
          (_this$controller = this.controller) == null || _this$controller.update(Math.min(deltaTime, 0.1));
        };
        _proto.onDestroy = function onDestroy() {
          var _this$controller2, _this$audioManager;
          (_this$controller2 = this.controller) == null || _this$controller2.dispose();
          this.controller = null;
          (_this$audioManager = this.audioManager) == null || _this$audioManager.dispose();
          this.audioManager = null;
        };
        return GameRoot;
      }(Component)) || _class));
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/GameTypes.ts", ['cc'], function (exports) {
  var cclegacy;
  return {
    setters: [function (module) {
      cclegacy = module.cclegacy;
    }],
    execute: function () {
      cclegacy._RF.push({}, "43b7dPz8iRJLq1pQM8joFnN", "GameTypes", undefined);
      var PassengerState = exports('PassengerState', /*#__PURE__*/function (PassengerState) {
        PassengerState["Waiting"] = "waiting";
        PassengerState["Boarding"] = "boarding";
        PassengerState["Riding"] = "riding";
        PassengerState["Exiting"] = "exiting";
        PassengerState["Delivered"] = "delivered";
        PassengerState["Lost"] = "lost";
        return PassengerState;
      }({}));
      var ElevatorDirection = exports('ElevatorDirection', /*#__PURE__*/function (ElevatorDirection) {
        ElevatorDirection[ElevatorDirection["Down"] = -1] = "Down";
        ElevatorDirection[ElevatorDirection["Idle"] = 0] = "Idle";
        ElevatorDirection[ElevatorDirection["Up"] = 1] = "Up";
        return ElevatorDirection;
      }({}));
      var UpgradeType = exports('UpgradeType', /*#__PURE__*/function (UpgradeType) {
        UpgradeType["Capacity"] = "capacity";
        UpgradeType["Speed"] = "speed";
        UpgradeType["Patience"] = "patience";
        return UpgradeType;
      }({}));
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/GameView.ts", ['./rollupPluginModLoBabelHelpers.js', 'cc', './GameTypes.ts'], function (exports) {
  var _createClass, _extends, cclegacy, Color, Vec3, UITransform, Label, Node, Layers, Sprite, resources, SpriteFrame, Graphics, UpgradeType, ElevatorDirection;
  return {
    setters: [function (module) {
      _createClass = module.createClass;
      _extends = module.extends;
    }, function (module) {
      cclegacy = module.cclegacy;
      Color = module.Color;
      Vec3 = module.Vec3;
      UITransform = module.UITransform;
      Label = module.Label;
      Node = module.Node;
      Layers = module.Layers;
      Sprite = module.Sprite;
      resources = module.resources;
      SpriteFrame = module.SpriteFrame;
      Graphics = module.Graphics;
    }, function (module) {
      UpgradeType = module.UpgradeType;
      ElevatorDirection = module.ElevatorDirection;
    }],
    execute: function () {
      cclegacy._RF.push({}, "bf1f4L5AwtK5KSn8EzWrXX5", "GameView", undefined);
      var INK = new Color(24, 25, 28, 255);
      var PAPER = new Color(247, 243, 237, 255);
      var MUTED = new Color(135, 139, 144, 255);
      var BLUE = new Color(27, 105, 198, 255);
      var GREEN = new Color(123, 181, 14, 255);
      var GOLD = new Color(240, 151, 0, 255);
      var DANGER = new Color(193, 92, 83, 255);
      var RED = new Color(205, 42, 47, 255);
      var PURPLE = new Color(106, 49, 164, 255);
      var CYAN = new Color(22, 158, 181, 255);
      var DESTINATION_COLORS = [PURPLE, GOLD, GREEN, BLUE, RED, CYAN, new Color(231, 92, 137, 255), new Color(64, 131, 102, 255), new Color(224, 104, 50, 255), new Color(80, 82, 190, 255), new Color(142, 89, 42, 255), new Color(38, 165, 135, 255)];
      var OFFICE_WALL = new Color(48, 50, 53, 245);
      var OFFICE_WALL_ALT = new Color(57, 59, 62, 245);
      var TOWER_BOTTOM = -425;
      var TOWER_TOP = 355;
      var FLOOR_GAP = 180;
      var FLOOR_BASE_Y = -285;
      var MIN_VISIBLE_FLOORS = 30;
      var GameView = exports('GameView', /*#__PURE__*/function () {
        function GameView(parent, events) {
          var _this = this;
          this.root = void 0;
          this.graphics = void 0;
          this.labels = {};
          this.floorYs = [];
          this.floorHitHalfHeight = 52;
          this.clickableFloors = 0;
          this.cabinHitAreas = [];
          this.activeElevatorIndex = 0;
          this.menuOpen = false;
          this.interactionMessage = '';
          this.towerScrollOffset = 0;
          this.deliveryFeedback = null;
          this.queueIncreaseFeedbacks = [];
          this.root = new Node('GameView');
          this.root.layer = Layers.Enum.UI_2D;
          parent.addChild(this.root);
          this.root.addComponent(UITransform).setContentSize(720, 1280);
          var backgroundNode = new Node('OfficeBackground');
          backgroundNode.layer = Layers.Enum.UI_2D;
          this.root.addChild(backgroundNode);
          backgroundNode.addComponent(UITransform).setContentSize(720, 1280);
          var background = backgroundNode.addComponent(Sprite);
          background.sizeMode = Sprite.SizeMode.CUSTOM;
          background.color = new Color(255, 255, 255, 48);
          resources.load('art/backgrounds/office-main/spriteFrame', SpriteFrame, function (error, spriteFrame) {
            if (!error && spriteFrame) {
              background.spriteFrame = spriteFrame;
            }
          });
          var drawingNode = new Node('GameDrawing');
          drawingNode.layer = Layers.Enum.UI_2D;
          this.root.addChild(drawingNode);
          drawingNode.addComponent(UITransform).setContentSize(720, 1280);
          this.graphics = drawingNode.addComponent(Graphics);
          this.createLabels();
          events.on('passenger-delivered', function (event) {
            _this.deliveryFeedback = _extends({}, event, {
              startedAt: Date.now()
            });
          });
        }
        var _proto = GameView.prototype;
        _proto.toLocalPosition = function toLocalPosition(uiX, uiY) {
          return new Vec3(uiX - 360, uiY - 640, 0);
        };
        _proto.render = function render(model) {
          this.graphics.clear();
          this.hidePassengerDestinationLabels();
          this.hideDynamicTowerLabels();
          this.drawBackground();
          this.drawTower(model);
          this.drawQueueIncreaseFeedbacks();
          this.drawDeliveryFeedback(model);
          this.drawTowerViewportMasks();
          this.drawHeader(model);
          this.drawBuildButton(model);
          if (this.menuOpen) {
            this.drawMenu(model);
          } else {
            this.setMenuLabelsActive(false);
          }
          if (!model.progress.started && !model.progress.failed && !model.progress.completed) {
            this.drawStartPrompt(model);
          } else {
            this.labels.start.node.active = false;
          }
          if (model.progress.completed) {
            this.drawCompletion(model);
          } else {
            this.labels.complete.node.active = false;
            this.setUpgradeLabelsActive(false);
          }
          if (model.progress.failed) {
            this.drawFailure(model);
          } else {
            this.labels.failure.node.active = false;
            this.labels.restart.node.active = false;
          }
        };
        _proto.floorAt = function floorAt(position) {
          if (!this.isTowerViewport(position)) {
            return null;
          }
          for (var floor = 0; floor < Math.min(this.clickableFloors, this.floorYs.length); floor += 1) {
            if (Math.abs(position.y - this.floorYs[floor]) <= this.floorHitHalfHeight && position.x > -340 && position.x < 340) {
              return floor;
            }
          }
          return null;
        };
        _proto.isCabin = function isCabin(position) {
          return this.cabinAt(position) !== null;
        };
        _proto.cabinAt = function cabinAt(position) {
          var _hit$index;
          if (!this.isTowerViewport(position)) {
            return null;
          }
          var hit = this.cabinHitAreas.find(function (area) {
            return position.x > area.x && position.x < area.x + area.width && Math.abs(position.y - area.y) < area.height * 0.5;
          });
          return (_hit$index = hit == null ? void 0 : hit.index) != null ? _hit$index : null;
        };
        _proto.isTowerViewport = function isTowerViewport(position) {
          return position.x > -340 && position.x < 340 && position.y > TOWER_BOTTOM && position.y < TOWER_TOP;
        };
        _proto.scrollTowerBy = function scrollTowerBy(deltaY, floorCount) {
          this.towerScrollOffset = this.clampTowerScroll(this.towerScrollOffset + deltaY, floorCount);
        };
        _proto.resetTowerScroll = function resetTowerScroll() {
          this.towerScrollOffset = 0;
        };
        _proto.setActiveElevator = function setActiveElevator(index) {
          this.activeElevatorIndex = index;
        };
        _proto.isBuildButton = function isBuildButton(position) {
          return position.x > -320 && position.x < -220 && position.y > -540 && position.y < -430;
        };
        _proto.isStartButton = function isStartButton(position) {
          return position.x > -105 && position.x < 135 && position.y > -560 && position.y < -480;
        };
        _proto.isMenuButton = function isMenuButton(position) {
          return position.x > 230 && position.x < 330 && position.y > 500 && position.y < 590;
        };
        _proto.isRestartButton = function isRestartButton(position) {
          return position.x > -125 && position.x < 125 && position.y > -145 && position.y < -65;
        };
        _proto.upgradeAt = function upgradeAt(position) {
          if (position.y < -75 || position.y > 35) {
            return null;
          }
          if (position.x > -290 && position.x < -100) {
            return UpgradeType.Capacity;
          }
          if (position.x > -95 && position.x < 95) {
            return UpgradeType.Speed;
          }
          if (position.x > 100 && position.x < 290) {
            return UpgradeType.Patience;
          }
          return null;
        };
        _proto.toggleMenu = function toggleMenu() {
          this.menuOpen = !this.menuOpen;
        };
        _proto.setInteractionMessage = function setInteractionMessage(message) {
          this.interactionMessage = message;
        };
        _proto.showQueueIncrease = function showQueueIncrease(floor, count) {
          if (count <= 0) {
            return;
          }
          this.queueIncreaseFeedbacks.push({
            floor: floor,
            count: count,
            startedAt: Date.now()
          });
          if (this.queueIncreaseFeedbacks.length > 8) {
            this.queueIncreaseFeedbacks.shift();
          }
        };
        _proto.createLabels = function createLabels() {
          var _this$labels$build$no, _this$labels$failure$, _this$labels$restart$, _this$labels$start$no;
          this.labels.time = this.createLabel('Time', 64, 180, new Vec3(-310, 555));
          this.labels.day = this.createLabel('Day', 22, 260, new Vec3(-310, 485));
          this.labels.stats = this.createLabel('Stats', 22, 290, new Vec3(80, 485));
          this.labels.floorHint = this.createLabel('Hint', 18, 260, new Vec3(-250, -390));
          this.labels.build = this.createLabel('Build', 20, 90, new Vec3(-312, -505));
          (_this$labels$build$no = this.labels.build.node.getComponent(UITransform)) == null || _this$labels$build$no.setContentSize(92, 96);
          this.labels.build.horizontalAlign = Label.HorizontalAlign.CENTER;
          this.labels.menu = this.createLabel('Menu', 22, 96, new Vec3(240, 555));
          this.labels.notice = this.createLabel('Notice', 24, 610, new Vec3(-305, 390));
          this.labels.complete = this.createLabel('Complete', 34, 540, new Vec3(-270, 30));
          this.labels.complete.node.active = false;
          this.labels.failure = this.createLabel('Failure', 34, 540, new Vec3(-270, 30));
          (_this$labels$failure$ = this.labels.failure.node.getComponent(UITransform)) == null || _this$labels$failure$.setContentSize(540, 180);
          this.labels.failure.lineHeight = 46;
          this.labels.failure.node.active = false;
          this.labels.restart = this.createLabel('Restart', 26, 250, new Vec3(-125, -105));
          (_this$labels$restart$ = this.labels.restart.node.getComponent(UITransform)) == null || _this$labels$restart$.setContentSize(250, 80);
          this.labels.restart.horizontalAlign = Label.HorizontalAlign.CENTER;
          this.labels.restart.node.active = false;
          this.labels.start = this.createLabel('Start', 26, 240, new Vec3(-100, -520));
          (_this$labels$start$no = this.labels.start.node.getComponent(UITransform)) == null || _this$labels$start$no.setContentSize(240, 80);
          this.labels.start.horizontalAlign = Label.HorizontalAlign.CENTER;
          this.labels.start.node.active = false;
        };
        _proto.createLabel = function createLabel(name, fontSize, width, position) {
          var node = new Node(name);
          node.layer = Layers.Enum.UI_2D;
          node.setPosition(position);
          this.root.addChild(node);
          var transform = node.addComponent(UITransform);
          transform.setAnchorPoint(0, 0.5);
          transform.setContentSize(width, fontSize * 1.6);
          var label = node.addComponent(Label);
          label.fontSize = fontSize;
          label.lineHeight = fontSize * 1.25;
          label.color = INK;
          label.horizontalAlign = Label.HorizontalAlign.LEFT;
          label.verticalAlign = Label.VerticalAlign.CENTER;
          label.overflow = Label.Overflow.SHRINK;
          return label;
        };
        _proto.drawBackground = function drawBackground() {
          this.graphics.fillColor = new Color(247, 243, 237, 248);
          this.graphics.rect(-360, 430, 720, 210);
          this.graphics.fill();
          this.graphics.fillColor = new Color(24, 26, 29, 225);
          this.graphics.rect(-360, -640, 720, 1070);
          this.graphics.fill();
        };
        _proto.drawHeader = function drawHeader(model) {
          var minutes = Math.floor(model.progress.elapsedSeconds / 60);
          var seconds = Math.floor(model.progress.elapsedSeconds % 60);
          this.labels.time.string = String(minutes).padStart(2, '0') + ":" + String(seconds).padStart(2, '0');
          this.labels.day.string = "\u7B2C" + model.progress.day + "\u5929    \u7B49\u7EA7" + model.progress.level;
          this.labels.stats.string = model.economy.delivered + "  \u5DF2\u9001\u8FBE    " + model.waitingPassengers.length + "  \u7B49\u5F85\u4E2D";
          this.labels.menu.string = '菜单';
          this.labels.notice.string = this.interactionMessage || (!model.progress.started ? '点击开始运营后，乘客才会出现和倒计时' : model.economy.multiplier > 1 ? model.economy.multiplier + "X  \u8FDE\u7EED\u9AD8\u8010\u5FC3\u9001\u8FBE" : '点击楼层呼叫 S1，到达后点击轿厢让上班族依次进入');
          this.strokeRect(230, 520, 100, 70, INK, 2);
          this.strokeRect(-320, 450, 640, 14, INK, 2);
          this.graphics.fillColor = INK;
          var progress = Math.min(1, model.economy.delivered / model.progress.targetDeliveries);
          this.graphics.rect(-317, 453, 634 * progress, 8);
          this.graphics.fill();
        };
        _proto.drawTower = function drawTower(model) {
          var _this2 = this;
          var floorCount = Math.max(MIN_VISIBLE_FLOORS, model.progress.unlockedFloors);
          var floorGap = FLOOR_GAP;
          var bottomY = FLOOR_BASE_Y + this.towerScrollOffset;
          var towerLeft = -340;
          var towerRight = 340;
          var s2Left = 105;
          var s1Left = 220;
          var shaftWidth = 100;
          this.clickableFloors = model.progress.unlockedFloors;
          this.floorYs.length = 0;
          this.cabinHitAreas.length = 0;
          this.floorHitHalfHeight = floorGap * 0.48;
          for (var floor = 0; floor < floorCount; floor += 1) {
            var y = bottomY + floor * floorGap;
            this.floorYs.push(y);
            if (y + floorGap * 0.5 < TOWER_BOTTOM || y - floorGap * 0.5 > TOWER_TOP) {
              continue;
            }
            this.graphics.fillColor = floor % 2 === 0 ? OFFICE_WALL : OFFICE_WALL_ALT;
            this.graphics.rect(towerLeft, y - floorGap * 0.48, towerRight - towerLeft, floorGap * 0.96);
            this.graphics.fill();
            if (model.warningFloors.includes(floor)) {
              var pulse = (Math.sin(model.progress.elapsedSeconds * Math.PI * 5) + 1) * 0.5;
              this.graphics.fillColor = new Color(205, 42, 47, 35 + Math.round(pulse * 95));
              this.graphics.rect(towerLeft, y - floorGap * 0.48, towerRight - towerLeft, floorGap * 0.96);
              this.graphics.fill();
            }
            this.line(towerLeft, y - floorGap * 0.48, towerRight, y - floorGap * 0.48, new Color(12, 13, 15, 255), 3);
            this.drawFloorMarker(floor, y, floor < model.progress.unlockedFloors);
            this.drawOfficeDetails(floor, y, floorGap, floor < model.progress.unlockedFloors);
            if (floor < model.progress.unlockedFloors) {
              this.drawPassengers(model, floor, y);
            }
            this.drawEmptyShaft(s2Left, y, floorGap, 'S2');
            this.drawEmptyShaft(s1Left, y, floorGap, 'S1');
          }
          var elevatorXs = [s1Left, s2Left];
          model.elevators.forEach(function (elevator, index) {
            var elevatorY = bottomY + elevator.position * floorGap;
            if (elevatorY > TOWER_BOTTOM - 70 && elevatorY < TOWER_TOP + 70) {
              _this2.drawCabin(model, elevator, index, elevatorXs[index], elevatorY, shaftWidth);
            }
          });
        };
        _proto.clampTowerScroll = function clampTowerScroll(offset, floorCount) {
          var visibleFloors = Math.max(MIN_VISIBLE_FLOORS, floorCount);
          var naturalTop = FLOOR_BASE_Y + Math.max(0, visibleFloors - 1) * FLOOR_GAP;
          var minOffset = Math.min(0, TOWER_TOP - FLOOR_GAP * 0.55 - naturalTop);
          return Math.max(minOffset, Math.min(0, offset));
        };
        _proto.drawTowerViewportMasks = function drawTowerViewportMasks() {
          this.graphics.fillColor = new Color(24, 26, 29, 255);
          this.graphics.rect(-360, -640, 720, TOWER_BOTTOM + 640);
          this.graphics.fill();
          this.graphics.fillColor = new Color(247, 243, 237, 255);
          this.graphics.rect(-360, TOWER_TOP, 720, 640 - TOWER_TOP);
          this.graphics.fill();
          this.line(-340, TOWER_BOTTOM, 340, TOWER_BOTTOM, new Color(120, 122, 126, 180), 2);
          this.line(-340, TOWER_TOP, 340, TOWER_TOP, new Color(120, 122, 126, 180), 2);
        };
        _proto.drawFloorMarker = function drawFloorMarker(floor, y, unlocked) {
          var floorLabel = this.formatFloorLabel(floor);
          var color = this.floorColor(floor);
          this.graphics.fillColor = unlocked ? color : new Color(76, 78, 82, 210);
          this.graphics.rect(-340, y - 55, 76, 110);
          this.graphics.fill();
          this.drawText("floor-" + floor, floorLabel, -326, y + 23, 32, unlocked ? PAPER : MUTED, 64);
          this.drawDestinationShape(floor, -302, y - 25, 15, unlocked ? PAPER : MUTED);
        };
        _proto.drawOfficeDetails = function drawOfficeDetails(floor, y, floorGap, unlocked) {
          this.graphics.fillColor = new Color(27, 29, 31, 255);
          this.graphics.roundRect(-238, y - 34, 88, 68, 3);
          this.graphics.fill();
          this.strokeRect(-238, y - 34, 88, 68, new Color(96, 99, 103, 255), 2);
          this.line(-209, y - 31, -209, y + 31, new Color(118, 121, 125, 255), 2);
          var companyNames = ['大堂接待', '星火创意', '启明咨询', '智云数据', '未来科技', '国际会议'];
          this.graphics.fillColor = new Color(30, 31, 33, 255);
          this.graphics.roundRect(-135, y - 28, 150, 56, 3);
          this.graphics.fill();
          this.strokeRect(-135, y - 28, 150, 56, new Color(116, 118, 121, 255), 1);
          this.drawText("company-" + floor, unlocked ? companyNames[floor % companyNames.length] : '待招商楼层', -112, y + 2, 17, unlocked ? PAPER : MUTED, 120);
          this.graphics.fillColor = new Color(237, 232, 222, 90);
          this.graphics.circle(-222, y + floorGap * 0.34, 4);
          this.graphics.circle(-86, y + floorGap * 0.34, 4);
          this.graphics.fill();
        };
        _proto.drawEmptyShaft = function drawEmptyShaft(x, y, floorGap, name) {
          var height = Math.min(112, floorGap * 0.72);
          this.graphics.fillColor = new Color(25, 27, 30, 255);
          this.graphics.roundRect(x, y - height * 0.5, 100, height, 5);
          this.graphics.fill();
          this.strokeRect(x, y - height * 0.5, 100, height, new Color(91, 95, 100, 255), 3);
          this.graphics.fillColor = new Color(12, 13, 15, 255);
          this.graphics.roundRect(x + 17, y + height * 0.5 - 2, 66, 24, 3);
          this.graphics.fill();
          this.drawText("shaft-" + name + "-" + Math.round(y), name, x + 37, y + height * 0.5 + 10, 14, PAPER, 40);
          if (name === 'S2') {
            this.graphics.fillColor = new Color(12, 13, 15, 150);
            this.graphics.roundRect(x + 4, y - height * 0.5 + 4, 92, height - 8, 4);
            this.graphics.fill();
            this.drawText("shaft-" + name + "-locked-" + Math.round(y), '未启用', x + 27, y, 13, MUTED, 54);
          }
        };
        _proto.drawPassengers = function drawPassengers(model, floor, y) {
          var _this3 = this;
          var passengers = model.getFloorLine(floor).slice(0, 8);
          passengers.forEach(function (passenger, index) {
            // The oldest passenger is closest to the elevator on the right.
            var x = 75 - index * 40;
            _this3.drawPassenger(passenger, _this3.getPassengerX(model, passenger, x), y, model.getPassengerWaitProgress(passenger), model.shouldShowPassengerTimer(passenger));
          });
        };
        _proto.getPassengerX = function getPassengerX(model, passenger, queueX) {
          var elevatorIndex = model.getPassengerBoardingElevatorIndex(passenger);
          if (elevatorIndex === null) {
            return queueX;
          }
          var progress = model.getPassengerBoardingProgress(passenger);
          var cabinDoorX = elevatorIndex === 0 ? 230 : 115;
          return queueX + (cabinDoorX - queueX) * progress;
        };
        _proto.drawPassenger = function drawPassenger(passenger, x, y, waitProgress, showTimer) {
          var clothingColor = this.floorColor(passenger.destinationFloor);
          var female = passenger.id % 2 === 0;
          this.graphics.fillColor = new Color(238, 199, 165, 255);
          this.graphics.circle(x, y + 13, 9);
          this.graphics.fill();
          this.graphics.fillColor = new Color(55, 37, 30, 255);
          this.graphics.arc(x, y + 16, 10, 0, Math.PI, false);
          this.graphics.fill();
          this.graphics.fillColor = clothingColor;
          this.graphics.roundRect(x - 10, y - 10, 20, 20, 4);
          this.graphics.fill();
          this.drawText("passenger-destination-" + passenger.id, this.formatFloorLabel(passenger.destinationFloor), x - 11, y - 4, 10, PAPER, 24);
          this.graphics.fillColor = INK;
          if (female) {
            this.graphics.moveTo(x - 10, y - 8);
            this.graphics.lineTo(x + 10, y - 8);
            this.graphics.lineTo(x + 13, y - 20);
            this.graphics.lineTo(x - 13, y - 20);
            this.graphics.close();
            this.graphics.fill();
          } else {
            this.graphics.rect(x - 9, y - 20, 7, 11);
            this.graphics.rect(x + 2, y - 20, 7, 11);
            this.graphics.fill();
          }
          if (!showTimer) {
            return;
          }
          this.graphics.strokeColor = waitProgress >= 0.75 ? DANGER : new Color(225, 220, 211, 170);
          this.graphics.lineWidth = 2;
          this.graphics.arc(x, y, 25, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * waitProgress, false);
          this.graphics.stroke();
        };
        _proto.drawCabin = function drawCabin(model, elevator, elevatorIndex, x, y, width) {
          var _this4 = this;
          this.cabinHitAreas.push({
            index: elevatorIndex,
            x: x,
            y: y,
            width: width,
            height: 164
          });
          var selected = elevatorIndex === this.activeElevatorIndex;
          if (selected) {
            this.strokeRect(x, y - 62, width, 136, GOLD, 4);
          }
          this.graphics.fillColor = new Color(194, 199, 203, 255);
          this.graphics.strokeColor = new Color(15, 16, 18, 255);
          this.graphics.lineWidth = 3;
          this.graphics.roundRect(x + 5, y - 50, width - 10, 100, 5);
          this.graphics.fill();
          this.graphics.stroke();
          this.graphics.fillColor = new Color(71, 75, 80, 255);
          this.graphics.rect(x + 11, y - 43, width - 22, 86);
          this.graphics.fill();
          this.line(x + width * 0.5, y - 42, x + width * 0.5, y + 42, MUTED, 2);
          var target = elevator.targetFloor;
          var direction = elevator.direction === ElevatorDirection.Up ? '↑' : elevator.direction === ElevatorDirection.Down ? '↓' : '';
          this.graphics.fillColor = INK;
          this.graphics.rect(x + 17, y + 54, width - 34, 25);
          this.graphics.fill();
          this.drawText("cabin-target-" + elevatorIndex, target === null ? "" + (selected ? '●' : '') + elevator.id : "" + direction + this.formatFloorLabel(target), x + 37, y + 66, 14, PAPER, 48);
          elevator.passengers.slice(0, elevator.capacity).forEach(function (id, index) {
            var passenger = model.getPassenger(id);
            if (passenger) {
              var column = index % 3;
              var row = Math.floor(index / 3);
              _this4.graphics.fillColor = _this4.floorColor(passenger.destinationFloor);
              _this4.graphics.roundRect(x + 17 + column * 22, y - 7 - row * 23, 14, 18, 3);
              _this4.graphics.fill();
              _this4.drawText("cabin-passenger-" + id, _this4.formatFloorLabel(passenger.destinationFloor), x + 18 + column * 22, y + 2 - row * 23, 8, PAPER, 16);
            }
          });
        };
        _proto.drawDeliveryFeedback = function drawDeliveryFeedback(model) {
          var feedback = this.deliveryFeedback;
          var label = this.labels.deliveryCount;
          if (!feedback || Date.now() - feedback.startedAt > 650) {
            if (label) {
              label.node.active = false;
            }
            return;
          }
          var floorY = this.floorYs[feedback.floor];
          var passenger = model.getPassenger(feedback.passengerId);
          if (floorY === undefined || floorY < TOWER_BOTTOM || floorY > TOWER_TOP || !passenger) {
            if (label) {
              label.node.active = false;
            }
            return;
          }
          var progress = Math.min(1, (Date.now() - feedback.startedAt) / 650);
          this.drawPassenger(passenger, 205 - progress * 62, floorY, 1, false);
          this.graphics.fillColor = new Color(22, 23, 25, 230);
          this.graphics.roundRect(95, floorY + 29, 94, 34, 6);
          this.graphics.fill();
          this.drawText('deliveryCount', "+1  " + feedback.stopDeliveredCount, 111, floorY + 46, 17, PAPER, 68);
        };
        _proto.drawBuildButton = function drawBuildButton(model) {
          this.graphics.fillColor = INK;
          this.graphics.rect(-320, -540, 100, 110);
          this.graphics.fill();
          this.labels.build.color = PAPER;
          this.labels.build.string = "\u589E\u5C42\n" + model.floorExtensionCost;
          var occupancy = model.elevators.reduce(function (sum, _elevator, index) {
            return sum + model.elevatorOccupancyAt(index);
          }, 0);
          var capacity = model.elevators.reduce(function (sum, elevator) {
            return sum + elevator.capacity;
          }, 0);
          this.labels.floorHint.string = "\u5206\u6570 " + model.economy.score + "    " + model.economy.multiplier + "X    \u91D1\u5E01 " + model.economy.coins + "    \u8F7D\u5BA2 " + occupancy + "/" + capacity;
        };
        _proto.drawStartPrompt = function drawStartPrompt(model) {
          this.graphics.fillColor = new Color(247, 242, 234, 218);
          this.graphics.roundRect(-300, -120, 600, 220, 8);
          this.graphics.fill();
          this.strokeRect(-300, -120, 600, 220, INK, 2);
          this.drawText('start-title', '写字楼电梯调度', -230, 45, 34, INK, 460);
          this.drawText('start-desc', "\u9009\u62E9 S1 \u6216 S2 \u540E\uFF0C\u8FDE\u7EED\u70B9\u51FB\u697C\u5C42\u4F1A\u6309\u987A\u5E8F\u505C\u7AD9\n\u672C\u5C40\u76EE\u6807 " + model.progress.targetDeliveries + " \u4EBA \xB7 \u6700\u9AD8\u5206 " + model.economy.bestScore, -230, -20, 20, MUTED, 480);
          this.graphics.fillColor = INK;
          this.graphics.roundRect(-105, -560, 240, 80, 5);
          this.graphics.fill();
          this.labels.start.node.active = true;
          this.labels.start.color = PAPER;
          this.labels.start.string = '开始运营';
        };
        _proto.drawQueueIncreaseFeedbacks = function drawQueueIncreaseFeedbacks() {
          var now = Date.now();
          for (var index = this.queueIncreaseFeedbacks.length - 1; index >= 0; index -= 1) {
            var feedback = this.queueIncreaseFeedbacks[index];
            var age = now - feedback.startedAt;
            if (age > 900) {
              this.queueIncreaseFeedbacks.splice(index, 1);
              continue;
            }
            var floorY = this.floorYs[feedback.floor];
            if (floorY === undefined || floorY < TOWER_BOTTOM || floorY > TOWER_TOP) {
              continue;
            }
            var progress = age / 900;
            var alpha = 255 - Math.round(progress * 200);
            this.drawText("queue-increase-" + index, "+" + feedback.count, 96, floorY + 34 + progress * 26, 23, new Color(247, 243, 237, alpha), 58);
          }
        };
        _proto.drawCompletion = function drawCompletion(model) {
          this.graphics.fillColor = new Color(247, 242, 234, 235);
          this.graphics.rect(-320, -180, 640, 360);
          this.graphics.fill();
          this.strokeRect(-320, -180, 640, 360, INK, 3);
          this.labels.complete.node.active = true;
          this.labels.complete.node.setPosition(-275, 105);
          this.labels.complete.string = "\u8FD0\u8425\u5347\u7EA7 \xB7 \u5206\u6570 " + model.economy.score;
          this.drawUpgradeCard(-290, UpgradeType.Capacity, '扩容', "\u6BCF\u90E8\u5BB9\u91CF +1\n\u5F53\u524D " + model.elevator.capacity);
          this.drawUpgradeCard(-95, UpgradeType.Speed, '提速', "\u8FD0\u884C\u901F\u5EA6 +15%\n\u7B49\u7EA7 " + model.upgrades.speedLevel);
          this.drawUpgradeCard(100, UpgradeType.Patience, '安抚', "\u8010\u5FC3\u4E0A\u9650 +4\u79D2\n\u7B49\u7EA7 " + model.upgrades.patienceLevel);
        };
        _proto.drawFailure = function drawFailure(model) {
          this.graphics.fillColor = new Color(24, 25, 28, 225);
          this.graphics.rect(-320, -180, 640, 360);
          this.graphics.fill();
          this.strokeRect(-320, -180, 640, 360, DANGER, 4);
          this.labels.failure.node.active = true;
          this.labels.failure.color = PAPER;
          this.labels.failure.node.setPosition(-265, 65);
          this.labels.failure.string = "\u672C\u6B21\u8FD0\u8425\u5931\u8D25\n\u6709\u4E58\u5BA2\u7B49\u5F85\u8D85\u65F6\u79BB\u5F00\n\u5206\u6570 " + model.economy.score + " \xB7 \u5DF2\u9001\u8FBE " + model.economy.delivered + " \u4EBA";
          this.graphics.fillColor = PAPER;
          this.graphics.roundRect(-125, -145, 250, 80, 5);
          this.graphics.fill();
          this.labels.restart.node.active = true;
          this.labels.restart.color = INK;
          this.labels.restart.string = '重新开始';
        };
        _proto.drawUpgradeCard = function drawUpgradeCard(x, key, title, description) {
          this.strokeRect(x, -75, 190, 110, INK, 2);
          this.drawText("upgrade-" + key + "-title", title, x + 16, -5, 25, INK);
          this.drawText("upgrade-" + key + "-desc", description, x + 16, -45, 17, MUTED);
        };
        _proto.setUpgradeLabelsActive = function setUpgradeLabelsActive(active) {
          var _this5 = this;
          [UpgradeType.Capacity, UpgradeType.Speed, UpgradeType.Patience].forEach(function (key) {
            ["upgrade-" + key + "-title", "upgrade-" + key + "-desc"].forEach(function (labelKey) {
              if (_this5.labels[labelKey]) {
                _this5.labels[labelKey].node.active = active;
              }
            });
          });
        };
        _proto.drawMenu = function drawMenu(model) {
          this.graphics.fillColor = new Color(247, 242, 234, 245);
          this.graphics.rect(-300, -180, 600, 360);
          this.graphics.fill();
          this.strokeRect(-300, -180, 600, 360, INK, 3);
          this.drawText('menu-title', '运营菜单', -245, 105, 38, INK);
          this.drawText('menu-progress', "\u7B2C " + model.progress.day + " \u5929 \xB7 \u7B49\u7EA7 " + model.progress.level, -245, 40, 24, MUTED);
          this.drawText('menu-save', '进度已自动保存', -245, -25, 24, INK);
          this.drawText('menu-close', '再次点击右上角菜单继续', -245, -105, 22, MUTED);
        };
        _proto.setMenuLabelsActive = function setMenuLabelsActive(active) {
          var _this6 = this;
          ['menu-title', 'menu-progress', 'menu-save', 'menu-close'].forEach(function (key) {
            if (_this6.labels[key]) {
              _this6.labels[key].node.active = active;
            }
          });
        };
        _proto.hidePassengerDestinationLabels = function hidePassengerDestinationLabels() {
          Object.entries(this.labels).forEach(function (_ref) {
            var key = _ref[0],
              label = _ref[1];
            if (key.startsWith('passenger-destination-')) {
              label.node.active = false;
            }
          });
        };
        _proto.hideDynamicTowerLabels = function hideDynamicTowerLabels() {
          Object.entries(this.labels).forEach(function (_ref2) {
            var key = _ref2[0],
              label = _ref2[1];
            if (key.startsWith('shaft-') || key.startsWith('floor-') || key.startsWith('company-') || key.startsWith('cabin-target-') || key.startsWith('cabin-passenger-') || key.startsWith('queue-increase-') || key.startsWith('start-') || key === 'deliveryCount') {
              label.node.active = false;
            }
          });
        };
        _proto.floorColor = function floorColor(floor) {
          return DESTINATION_COLORS[floor % DESTINATION_COLORS.length];
        };
        _proto.formatFloorLabel = function formatFloorLabel(floor) {
          return floor === 0 ? 'G' : String(floor).padStart(2, '0');
        };
        _proto.drawDestinationShape = function drawDestinationShape(floor, x, y, radius, color) {
          this.graphics.fillColor = color != null ? color : this.floorColor(floor);
          var shape = floor % 6;
          if (shape === 0) {
            this.graphics.moveTo(x, y + radius);
            this.graphics.lineTo(x - radius, y - radius);
            this.graphics.lineTo(x + radius, y - radius);
            this.graphics.close();
          } else if (shape === 1) {
            this.graphics.moveTo(x, y + radius);
            this.graphics.lineTo(x - radius, y);
            this.graphics.lineTo(x, y - radius);
            this.graphics.lineTo(x + radius, y);
            this.graphics.close();
          } else if (shape === 2) {
            this.graphics.rect(x - radius, y - radius, radius * 2, radius * 2);
          } else if (shape === 3) {
            this.graphics.circle(x, y, radius);
          } else if (shape === 4) {
            this.graphics.roundRect(x - radius, y - radius, radius * 2, radius * 2, radius * 0.45);
          } else {
            this.graphics.moveTo(x, y + radius);
            this.graphics.lineTo(x - radius, y + radius * 0.3);
            this.graphics.lineTo(x - radius * 0.65, y - radius);
            this.graphics.lineTo(x + radius * 0.65, y - radius);
            this.graphics.lineTo(x + radius, y + radius * 0.3);
            this.graphics.close();
          }
          this.graphics.fill();
        };
        _proto.drawText = function drawText(key, text, x, y, size, color, width) {
          if (width === void 0) {
            width = 220;
          }
          var label = this.labels[key];
          if (!label) {
            label = this.createLabel(key, size, width, new Vec3(x, y));
            this.labels[key] = label;
          }
          label.node.active = true;
          label.color = color;
          label.string = text;
          label.node.setPosition(x, y);
        };
        _proto.strokeRect = function strokeRect(x, y, width, height, color, lineWidth) {
          this.graphics.strokeColor = color;
          this.graphics.lineWidth = lineWidth;
          this.graphics.rect(x, y, width, height);
          this.graphics.stroke();
        };
        _proto.line = function line(x1, y1, x2, y2, color, lineWidth) {
          this.graphics.strokeColor = color;
          this.graphics.lineWidth = lineWidth;
          this.graphics.moveTo(x1, y1);
          this.graphics.lineTo(x2, y2);
          this.graphics.stroke();
        };
        _createClass(GameView, [{
          key: "isMenuOpen",
          get: function get() {
            return this.menuOpen;
          }
        }]);
        return GameView;
      }());
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/IPlatformService.ts", ['cc'], function () {
  var cclegacy;
  return {
    setters: [function (module) {
      cclegacy = module.cclegacy;
    }],
    execute: function () {
      cclegacy._RF.push({}, "e14f2KWE31KVbk8VJ8UfdYz", "IPlatformService", undefined);
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/LocalPlatformService.ts", ['./rollupPluginModLoBabelHelpers.js', 'cc'], function (exports) {
  var _asyncToGenerator, _regeneratorRuntime, cclegacy;
  return {
    setters: [function (module) {
      _asyncToGenerator = module.asyncToGenerator;
      _regeneratorRuntime = module.regeneratorRuntime;
    }, function (module) {
      cclegacy = module.cclegacy;
    }],
    execute: function () {
      cclegacy._RF.push({}, "dbbea5tLU1OWIMrxG8O0V1I", "LocalPlatformService", undefined);
      var LocalPlatformService = exports('LocalPlatformService', /*#__PURE__*/function () {
        function LocalPlatformService() {
          this.name = 'local';
        }
        var _proto = LocalPlatformService.prototype;
        _proto.login = /*#__PURE__*/function () {
          var _login = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee() {
            return _regeneratorRuntime().wrap(function _callee$(_context) {
              while (1) switch (_context.prev = _context.next) {
                case 0:
                case "end":
                  return _context.stop();
              }
            }, _callee);
          }));
          function login() {
            return _login.apply(this, arguments);
          }
          return login;
        }();
        _proto.showRewardedAd = /*#__PURE__*/function () {
          var _showRewardedAd = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(_placement) {
            return _regeneratorRuntime().wrap(function _callee2$(_context2) {
              while (1) switch (_context2.prev = _context2.next) {
                case 0:
                  return _context2.abrupt("return", false);
                case 1:
                case "end":
                  return _context2.stop();
              }
            }, _callee2);
          }));
          function showRewardedAd(_x) {
            return _showRewardedAd.apply(this, arguments);
          }
          return showRewardedAd;
        }();
        _proto.submitScore = /*#__PURE__*/function () {
          var _submitScore = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(_score) {
            return _regeneratorRuntime().wrap(function _callee3$(_context3) {
              while (1) switch (_context3.prev = _context3.next) {
                case 0:
                case "end":
                  return _context3.stop();
              }
            }, _callee3);
          }));
          function submitScore(_x2) {
            return _submitScore.apply(this, arguments);
          }
          return submitScore;
        }();
        _proto.saveCloud = /*#__PURE__*/function () {
          var _saveCloud = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(_payload) {
            return _regeneratorRuntime().wrap(function _callee4$(_context4) {
              while (1) switch (_context4.prev = _context4.next) {
                case 0:
                case "end":
                  return _context4.stop();
              }
            }, _callee4);
          }));
          function saveCloud(_x3) {
            return _saveCloud.apply(this, arguments);
          }
          return saveCloud;
        }();
        _proto.loadCloud = /*#__PURE__*/function () {
          var _loadCloud = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5() {
            return _regeneratorRuntime().wrap(function _callee5$(_context5) {
              while (1) switch (_context5.prev = _context5.next) {
                case 0:
                  return _context5.abrupt("return", null);
                case 1:
                case "end":
                  return _context5.stop();
              }
            }, _callee5);
          }));
          function loadCloud() {
            return _loadCloud.apply(this, arguments);
          }
          return loadCloud;
        }();
        return LocalPlatformService;
      }());
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/main", ['./GameRoot.ts', './GameController.ts', './EventBus.ts', './AudioManager.ts', './GameManager.ts', './PlatformManager.ts', './StorageManager.ts', './GameModel.ts', './GameTypes.ts', './IPlatformService.ts', './LocalPlatformService.ts', './WeChatPlatformService.ts', './GameView.ts'], function () {
  return {
    setters: [null, null, null, null, null, null, null, null, null, null, null, null, null],
    execute: function () {}
  };
});

System.register("chunks:///_virtual/PlatformManager.ts", ['cc', './LocalPlatformService.ts', './WeChatPlatformService.ts'], function (exports) {
  var cclegacy, sys, LocalPlatformService, WeChatPlatformService;
  return {
    setters: [function (module) {
      cclegacy = module.cclegacy;
      sys = module.sys;
    }, function (module) {
      LocalPlatformService = module.LocalPlatformService;
    }, function (module) {
      WeChatPlatformService = module.WeChatPlatformService;
    }],
    execute: function () {
      cclegacy._RF.push({}, "5ff80Z7OO5MLbWiopNyuv+O", "PlatformManager", undefined);
      var PlatformManager = exports('PlatformManager', function PlatformManager() {
        this.service = void 0;
        this.service = sys.platform === sys.Platform.WECHAT_GAME ? new WeChatPlatformService() : new LocalPlatformService();
      });
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/StorageManager.ts", ['cc'], function (exports) {
  var cclegacy, sys;
  return {
    setters: [function (module) {
      cclegacy = module.cclegacy;
      sys = module.sys;
    }],
    execute: function () {
      cclegacy._RF.push({}, "a4e19SPXYFAk4DeT/EXNhBz", "StorageManager", undefined);
      var SAVE_KEY = 'elevator-mall-save-v1';
      var StorageManager = exports('StorageManager', /*#__PURE__*/function () {
        function StorageManager() {}
        var _proto = StorageManager.prototype;
        _proto.load = function load() {
          var raw = sys.localStorage.getItem(SAVE_KEY);
          if (!raw) {
            return null;
          }
          try {
            return JSON.parse(raw);
          } catch (_unused) {
            return null;
          }
        };
        _proto.save = function save(snapshot) {
          sys.localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
        };
        _proto.clear = function clear() {
          sys.localStorage.removeItem(SAVE_KEY);
        };
        return StorageManager;
      }());
      cclegacy._RF.pop();
    }
  };
});

System.register("chunks:///_virtual/WeChatPlatformService.ts", ['./rollupPluginModLoBabelHelpers.js', 'cc'], function (exports) {
  var _asyncToGenerator, _regeneratorRuntime, cclegacy;
  return {
    setters: [function (module) {
      _asyncToGenerator = module.asyncToGenerator;
      _regeneratorRuntime = module.regeneratorRuntime;
    }, function (module) {
      cclegacy = module.cclegacy;
    }],
    execute: function () {
      cclegacy._RF.push({}, "41f3elOhFtE2IEDMuHPkFWk", "WeChatPlatformService", undefined);
      var WeChatPlatformService = exports('WeChatPlatformService', /*#__PURE__*/function () {
        function WeChatPlatformService() {
          this.name = 'wechat';
        }
        var _proto = WeChatPlatformService.prototype;
        _proto.login = function login() {
          return new Promise(function (resolve, reject) {
            wx.login({
              success: resolve,
              fail: reject
            });
          });
        };
        _proto.showRewardedAd = /*#__PURE__*/function () {
          var _showRewardedAd = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_placement) {
            return _regeneratorRuntime().wrap(function _callee$(_context) {
              while (1) switch (_context.prev = _context.next) {
                case 0:
                  return _context.abrupt("return", false);
                case 1:
                case "end":
                  return _context.stop();
              }
            }, _callee);
          }));
          function showRewardedAd(_x) {
            return _showRewardedAd.apply(this, arguments);
          }
          return showRewardedAd;
        }();
        _proto.submitScore = function submitScore(score) {
          return new Promise(function (resolve, reject) {
            wx.setUserCloudStorage({
              KVDataList: [{
                key: 'best_deliveries',
                value: String(score)
              }],
              success: resolve,
              fail: reject
            });
          });
        };
        _proto.saveCloud = /*#__PURE__*/function () {
          var _saveCloud = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(_payload) {
            return _regeneratorRuntime().wrap(function _callee2$(_context2) {
              while (1) switch (_context2.prev = _context2.next) {
                case 0:
                case "end":
                  return _context2.stop();
              }
            }, _callee2);
          }));
          function saveCloud(_x2) {
            return _saveCloud.apply(this, arguments);
          }
          return saveCloud;
        }();
        _proto.loadCloud = /*#__PURE__*/function () {
          var _loadCloud = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3() {
            return _regeneratorRuntime().wrap(function _callee3$(_context3) {
              while (1) switch (_context3.prev = _context3.next) {
                case 0:
                  return _context3.abrupt("return", null);
                case 1:
                case "end":
                  return _context3.stop();
              }
            }, _callee3);
          }));
          function loadCloud() {
            return _loadCloud.apply(this, arguments);
          }
          return loadCloud;
        }();
        return WeChatPlatformService;
      }());
      cclegacy._RF.pop();
    }
  };
});

(function(r) {
  r('virtual:///prerequisite-imports/main', 'chunks:///_virtual/main'); 
})(function(mid, cid) {
    System.register(mid, [cid], function (_export, _context) {
    return {
        setters: [function(_m) {
            var _exportObj = {};

            for (var _key in _m) {
              if (_key !== "default" && _key !== "__esModule") _exportObj[_key] = _m[_key];
            }
      
            _export(_exportObj);
        }],
        execute: function () { }
    };
    });
});