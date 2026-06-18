import { GameModel, START_TIME, TIME_SCALE } from '../assets/scripts/models/GameModel';
import { ElevatorDirection, PassengerState } from '../assets/scripts/models/GameTypes';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function createRunningModel(levelId = '1-2'): GameModel {
    const model = new GameModel();
    model.loadLevel(levelId);
    model.startRun();
    return model;
}

function runUntilIdle(model: GameModel, maxSeconds = 20): void {
    for (let elapsed = 0; elapsed < maxSeconds; elapsed += 0.05) {
        model.update(0.05);
        if (model.elevator.targetFloor === null && model.elevator.queue.length === 0) {
            return;
        }
    }
    throw new Error('elevator did not become idle');
}

function testRunWaitsForExplicitStart(): void {
    const model = new GameModel();
    model.loadLevel('1-2');
    const passenger = model.createPassenger(0, 2);
    passenger.maxPatience = 1;
    passenger.waitElapsed = 0.99;
    passenger.patience = 0.01;

    model.update(1);

    assert(!model.progress.started, 'new games should wait for an explicit start');
    assert(model.progress.elapsedSeconds === 0, 'the clock must not run before start');
    assert(!model.progress.failed, 'waiting passengers must not time out before start');
    assert(passenger.patience === 0.01, 'passenger patience must be frozen before start');

    model.startRun();
    model.update(0.02);
    assert(model.progress.failed, 'after start, patience should resume and can fail the run');
}

function testManualBoardingIgnoresDirection(): void {
    const model = createRunningModel();
    model.elevator.currentFloor = 1;
    model.elevator.position = 1;
    const up = model.createPassenger(1, 2);
    const down = model.createPassenger(1, 0);

    const boarded = model.boardAtCurrentFloor();

    assert(boarded === 2, 'manual cabin click should board every waiting passenger that fits');
    assert(up.state === PassengerState.Boarding, 'first passenger should enter the boarding queue');
    assert(down.state === PassengerState.Boarding, 'second passenger should enter the boarding queue');
    assert(model.elevator.targetFloor === null, 'boarding must not dispatch the elevator');
    assert(model.elevator.queue.length === 0, 'passenger destinations must not enter the stop queue automatically');

    model.update(0.21);
    assert(model.elevator.passengers.length === 0, 'nobody should board before the first interval');
    model.update(0.02);
    assert(model.elevator.passengers.length === 1, 'passengers should board one at a time');
    assert(model.drainBoardedEvents().length === 1, 'each completed boarding should emit one sound event');
    model.update(0.22);
    assert(model.elevator.passengers.length === 2, 'the second passenger should board on the next interval');
    assert(model.drainBoardedEvents().length === 1, 'the second boarding should emit a separate sound event');
}

function testBoardingPassengersRemainInVisibleLineUntilTheyEnter(): void {
    const model = createRunningModel();
    const first = model.createPassenger(0, 2);
    const second = model.createPassenger(0, 1);

    assert(model.boardAtCurrentFloor() === 2, 'both passengers should be reserved for sequential boarding');
    assert(model.getFloorQueue(0).length === 0, 'reserved passengers should leave the interactive waiting queue');
    assert(
        model.getFloorLine(0).map((passenger) => passenger.id).join(',') === `${first.id},${second.id}`,
        'reserved passengers should remain visible in the floor line',
    );
    assert(model.getPassengerBoardingProgress(first) === 0, 'the first passenger should start walking from the queue');
    assert(model.getPassengerBoardingProgress(second) === 0, 'later passengers should wait for their turn');

    model.update(0.11);
    assert(model.getPassengerBoardingProgress(first) > 0, 'the queue head should animate toward the cabin');
    assert(model.getPassengerBoardingProgress(second) === 0, 'the second passenger should not move before the first enters');

    model.update(0.12);
    assert(first.state === PassengerState.Riding, 'the first passenger should enter the cabin at the beat');
    assert(second.state === PassengerState.Boarding, 'the second passenger should still be queued for the next beat');
    assert(model.getFloorLine(0).map((passenger) => passenger.id).join(',') === `${second.id}`, 'only the remaining passenger should stay visible');
    assert(model.drainBoardedEvents().length === 1, 'entering the cabin should emit exactly one boarding sound event');
}

function testPassengerWaitTimingMatchesFortySecondRule(): void {
    const model = createRunningModel();
    const passenger = model.createPassenger(0, 2);

    assert(passenger.maxPatience === 40, 'base passenger wait time should be 40 seconds');
    assert(!model.shouldShowPassengerTimer(passenger), 'timer ring should stay hidden before 20 seconds');
    assert(model.warningFloors.length === 0, 'warning should stay silent before 30 seconds');

    model.update(19.9);
    assert(!model.shouldShowPassengerTimer(passenger), 'timer ring should still be hidden just before 20 seconds');
    model.update(0.2);
    assert(model.shouldShowPassengerTimer(passenger), 'timer ring should appear at 20 seconds');
    assert(model.warningFloors.length === 0, 'warning should not start at 20 seconds');

    model.update(9.9);
    assert(model.warningFloors.includes(0), 'warning should start at 30 seconds');
    model.update(10);
    assert(model.progress.failed, 'the run should fail when the passenger reaches 40 seconds');
}

function testCallingPassengerFloorDoesNotAutoBoardWithoutOnwardStop(): void {
    const model = createRunningModel();
    const sameDirection = model.createPassenger(1, 2);
    const oppositeDirection = model.createPassenger(1, 0);

    model.queueFloor(1);
    assert(model.elevator.direction === ElevatorDirection.Up, 'elevator should travel upward');
    runUntilIdle(model);

    assert(sameDirection.state === PassengerState.Waiting, 'calling the passenger floor alone should not auto-board');
    assert(oppositeDirection.state === PassengerState.Waiting, 'opposite-direction passenger should also wait');
    assert(model.boardAtCurrentFloor() === 2, 'manual cabin tap should board waiting passengers');
}

function testAutomaticBoardingMatchesOnwardDirection(): void {
    const model = createRunningModel();
    const sameDirection = model.createPassenger(1, 2);
    const oppositeDirection = model.createPassenger(1, 0);

    model.queueFloor(1);
    model.queueFloor(2);
    assert(model.elevator.direction === ElevatorDirection.Up, 'elevator should travel upward');
    for (let elapsed = 0; elapsed < 10; elapsed += 0.05) {
        model.update(0.05);
        if (sameDirection.state === PassengerState.Boarding) {
            break;
        }
    }

    assert(sameDirection.state === PassengerState.Boarding, 'up passenger should auto-board only when the cabin continues upward');
    assert(oppositeDirection.state === PassengerState.Waiting, 'down passenger must wait for a down-going cabin');
    assert(model.elevator.currentFloor === 1, 'automatic boarding should leave the elevator at the arrival floor');
    assert(model.elevator.targetFloor === null, 'automatic boarding must wait for the next player floor click');
    assert(model.elevator.queue[0] === 2, 'the onward stop should remain queued while boarding completes');
}

function testAutomaticBoardingAfterUnloadingMatchesArrivalDirection(): void {
    const model = createRunningModel();
    const rider = model.createPassenger(0, 1);
    rider.state = PassengerState.Riding;
    rider.patience = rider.maxPatience;
    model.elevator.passengers = [rider.id];
    const sameDirection = model.createPassenger(1, 2);
    const oppositeDirection = model.createPassenger(1, 0);

    model.queueFloor(1);
    model.queueFloor(2);
    for (let elapsed = 0; elapsed < 10; elapsed += 0.05) {
        model.update(0.05);
        if (model.getPassenger(rider.id)?.state === PassengerState.Exiting) {
            break;
        }
    }
    assert(model.getPassenger(rider.id)?.state === PassengerState.Exiting, 'rider should unload before new passengers board');

    model.update(0.29);
    assert(model.getPassenger(rider.id)?.state === PassengerState.Delivered, 'rider should finish unloading first');
    assert(
        model.getPassenger(sameDirection.id)?.state !== PassengerState.Waiting,
        'same-direction passenger should board after unloading',
    );
    assert(model.getPassenger(oppositeDirection.id)?.state === PassengerState.Waiting, 'opposite-direction passenger should keep waiting');
}

function testCapacityKeepsRemainingPassengersInFifoQueue(): void {
    const model = createRunningModel();
    assert(model.elevator.capacity === 5, 'a single elevator should start with a max capacity of five passengers');
    model.elevator.capacity = 2;
    model.elevator2.currentFloor = 1;
    model.elevator2.position = 1;
    const first = model.createPassenger(0, 1);
    const second = model.createPassenger(0, 2);
    const third = model.createPassenger(0, 1);
    const fourth = model.createPassenger(0, 2);
    const thirdPatience = third.patience;

    const boarded = model.boardAtCurrentFloor();

    assert(boarded === 2, 'boarding must reserve no more than the cabin capacity');
    assert(first.state === PassengerState.Boarding, 'the first passenger should board first');
    assert(second.state === PassengerState.Boarding, 'the second passenger should board second');
    assert(third.state === PassengerState.Waiting, 'the third passenger should wait when the cabin is full');
    assert(fourth.state === PassengerState.Waiting, 'the fourth passenger should wait behind the third');
    assert(model.isElevatorFull, 'boarding passengers must count toward capacity immediately');
    assert(
        model.getFloorQueue(0).map((passenger) => passenger.id).join(',') === `${third.id},${fourth.id}`,
        'passengers reserved for boarding should leave the visible waiting queue immediately',
    );
    assert(model.boardAtCurrentFloor() === 0, 'a full cabin must reject another boarding request');

    model.update(0.23);
    assert(model.elevator.passengers[0] === first.id, 'passengers must enter the cabin in arrival order');
    assert(third.patience < thirdPatience, 'passengers left in line must keep losing patience');

    model.update(0.22);
    assert(model.elevator.passengers[1] === second.id, 'the second passenger must enter after the first');
    assert(
        model.getFloorQueue(0).map((passenger) => passenger.id).join(',') === `${third.id},${fourth.id}`,
        'remaining passengers must preserve FIFO order and move toward the front',
    );
}

function testPassengerPatienceRestartsInsideElevator(): void {
    const model = createRunningModel();
    const passenger = model.createPassenger(0, 2);
    passenger.maxPatience = 40;
    passenger.waitElapsed = 35;
    passenger.patience = 5;

    assert(model.boardAtCurrentFloor() === 1, 'the passenger should start boarding');
    assert(model.getFloorQueue(0).length === 0, 'boarding passengers should not remain in the waiting queue');
    model.update(0.23);

    assert(!model.progress.failed, 'boarding should not fail after the passenger was accepted');
    assert(passenger.state === PassengerState.Riding, 'the passenger should finish boarding into the elevator');
    assert(passenger.waitElapsed === 0, 'entering the elevator should restart the patience timer');
    assert(passenger.patience === 40, 'entering the elevator should grant a fresh forty-second patience window');

    model.update(39.9);
    assert(!model.shouldShowPassengerTimer(passenger), 'in-cabin timer should stay hidden before half-speed patience reaches 20 seconds');
    model.update(0.2);
    assert(model.shouldShowPassengerTimer(passenger), 'in-cabin timer should appear after half-speed patience reaches 20 seconds');
    model.update(19.9);
    assert(model.warningFloors.includes(0), 'in-cabin patience warning should start after half-speed patience reaches 30 seconds');
}

function testAutomaticBoardingCannotSkipQueueHead(): void {
    const model = createRunningModel();
    const oppositeDirection = model.createPassenger(1, 0);
    const sameDirection = model.createPassenger(1, 2);

    model.queueFloor(1);
    runUntilIdle(model);

    assert(oppositeDirection.state === PassengerState.Waiting, 'an incompatible queue head should keep waiting');
    assert(sameDirection.state === PassengerState.Waiting, 'a later passenger cannot overtake the queue head');
    assert(model.elevatorOccupancy === 0, 'nobody should board when the queue head blocks automatic boarding');
}

function testCallQueueRemainsFifo(): void {
    const model = createRunningModel();
    model.queueFloor(2);
    model.queueFloor(1);

    assert(model.elevator.targetFloor === 2, 'first floor call should remain the active target');
    assert(model.elevator.queue[0] === 1, 'later floor calls should remain FIFO');
}

function testRepeatedFloorCommandsRunInExactClickOrder(): void {
    const model = createRunningModel();
    model.progress.unlockedFloors = 5;

    assert(model.queueFloor(2), 'the first floor command should start immediately');
    assert(model.queueFloor(3), 'the second floor command should be appended');
    assert(model.queueFloor(2), 'a repeated floor must remain a separate command');
    assert(model.queueFloor(4), 'the fourth floor command should be appended');
    assert(model.elevator.targetFloor === 2, 'the first click should remain the active target');
    assert(
        model.elevator.queue.join(',') === '3,2,4',
        'the pending queue must preserve the exact 2,3,2,4 click sequence including duplicates',
    );

    const arrivals: number[] = [];
    let previousFloor = model.elevator.currentFloor;
    for (let elapsed = 0; elapsed < 20; elapsed += 0.05) {
        model.update(0.05);
        if (model.elevator.currentFloor !== previousFloor) {
            previousFloor = model.elevator.currentFloor;
            arrivals.push(previousFloor);
        }
        if (model.elevator.targetFloor === null && model.elevator.queue.length === 0) {
            break;
        }
    }

    assert(
        arrivals.join(',') === '2,3,2,4',
        'the elevator should autonomously stop in the exact order 2,3,2,4',
    );
}

function testFloorRequestStartsAfterBoardingCompletes(): void {
    const model = createRunningModel();
    model.createPassenger(0, 2);
    model.createPassenger(0, 1);
    model.boardAtCurrentFloor();

    const queued = model.queueFloor(2);

    assert(queued, 'a floor request made during boarding should be accepted');
    assert(model.elevator.targetFloor === null, 'the elevator should wait while passengers are boarding');
    assert(model.elevator.queue[0] === 2, 'the requested floor should remain queued during boarding');

    model.update(0.45);

    assert(model.elevator.targetFloor === 2, 'the elevator should start as soon as boarding completes');
    assert(model.elevator.direction === ElevatorDirection.Up, 'the delayed request should retain its direction');
}

function testCurrentFloorRequestDoesNotPretendToMove(): void {
    const model = createRunningModel();

    const queued = model.queueFloor(0);

    assert(!queued, 'requesting the current floor should not create a fake trip');
    assert(model.elevator.targetFloor === null, 'the elevator should remain idle at the current floor');
}

function testElevatorCanTravelToSecondAndThirdFloors(): void {
    const model = createRunningModel();
    model.progress.unlockedFloors = 4;

    assert(model.queueFloor(2), 'floor 2 should accept a request');
    assert(model.queueFloor(3), 'floor 3 should accept a request');
    assert(model.elevator.targetFloor === 2, 'floor 2 should be the first active destination');
    assert(model.elevator.queue[0] === 3, 'floor 3 should wait behind floor 2');

    for (let elapsed = 0; elapsed < 10; elapsed += 0.05) {
        model.update(0.05);
        if (model.elevator.currentFloor === 3 && model.elevator.targetFloor === null) {
            break;
        }
    }

    assert(model.elevator.currentFloor === 3, 'the elevator should reach floor 3 after stopping at floor 2');
    assert(model.elevator.targetFloor === null, 'the elevator should finish the requested route');
    assert(model.elevator.queue.length === 0, 'both upper-floor requests should be consumed');
}

function testPassengersLeaveOneAtATimeWithSeparateEvents(): void {
    const model = createRunningModel();
    const first = model.createPassenger(0, 1);
    const second = model.createPassenger(0, 1);
    first.state = PassengerState.Riding;
    second.state = PassengerState.Riding;
    model.elevator.passengers = [first.id, second.id];

    model.queueFloor(1);
    runUntilIdle(model);

    assert(
        model.getPassenger(first.id)?.state === PassengerState.Exiting,
        'the first passenger should wait in the unloading queue',
    );
    assert(
        model.getPassenger(second.id)?.state === PassengerState.Exiting,
        'the second passenger should wait behind the first',
    );
    assert(model.elevator.passengers.length === 2, 'both passengers should remain visible before unloading starts');

    model.update(0.27);
    assert(model.economy.delivered === 0, 'nobody should leave before the first unloading interval');
    model.update(0.02);
    const firstEvents = model.drainDeliveredEvents();
    assert(model.economy.delivered === 1, 'only one passenger should leave on the first interval');
    assert(model.elevator.passengers.length === 1, 'one passenger should remain inside the cabin');
    assert(firstEvents.length === 1, 'the first passenger should emit one sound and count event');
    assert(firstEvents[0].stopDeliveredCount === 1, 'the stop counter should start at one');

    model.update(0.28);
    const secondEvents = model.drainDeliveredEvents();
    assert(model.economy.delivered === 2, 'the second passenger should leave on the next interval');
    assert(model.elevator.passengers.length === 0, 'the cabin should be empty after both passengers leave');
    assert(secondEvents.length === 1, 'the second passenger should emit a separate event');
    assert(secondEvents[0].stopDeliveredCount === 2, 'the stop counter should increment for each passenger');
}

function testPatienceWarningAndFailureRule(): void {
    const model = createRunningModel();
    const passenger = model.createPassenger(0, 2);
    passenger.maxPatience = 40;
    passenger.waitElapsed = 29;
    passenger.patience = 11;

    model.update(1.1);
    assert(model.warningFloors.includes(0), 'the passenger floor should warn during the final quarter');
    model.update(0.8);
    const warningEvents = model.drainWarningEvents();
    assert(warningEvents.length >= 1, 'a warning floor should emit rhythmic warning events');
    assert(warningEvents[0].floor === 0, 'the warning event should identify the passenger floor');

    model.queueFloor(2);
    const positionBeforeFailure = model.elevator.position;
    model.update(10);
    assert(model.progress.failed, 'one timed-out passenger should fail the current game');
    assert(passenger.state === PassengerState.Lost, 'the timed-out passenger should leave the queue');
    model.update(1);
    assert(model.elevator.position === positionBeforeFailure, 'the simulation should freeze after failure');
}

function testRestartClearsFailedRun(): void {
    const model = createRunningModel();
    const passenger = model.createPassenger(1, 2);
    passenger.waitElapsed = 0.99;
    passenger.patience = 0.01;
    passenger.maxPatience = 1;
    model.economy.coins = 7;
    model.progress.unlockedFloors = 5;
    model.update(0.02);

    assert(model.progress.failed, 'the setup should enter the failed state');
    model.restartGame();

    assert(!model.progress.failed, 'restart should clear the failed state');
    assert(model.passengers.length === 0, 'restart should remove passengers from the failed run');
    assert(model.elevator.currentFloor === 0, 'restart should return the elevator to the lobby');
    assert(model.elevator.targetFloor === null, 'restart should clear the active elevator target');
    assert(model.progress.elapsedSeconds === 0, 'restart should reset the game clock');
    assert(model.progress.unlockedFloors === 5, 'restart should preserve constructed floors');
    assert(model.economy.coins === 7, 'restart should preserve the current economy');
}

function testStartNewGameResetsProgressAndEconomy(): void {
    const model = createRunningModel();
    model.economy.coins = 99;
    model.economy.stars = 5;
    model.economy.bestScore = 300;
    model.progress.day = 4;
    model.progress.level = 4;
    model.progress.unlockedFloors = 18;
    model.progress.gameTime = 12 * 60 + 30;
    model.upgrades.speedLevel = 3;

    model.startNewGame();

    assert(model.progress.day === 1, 'new game should reset the day');
    assert(model.progress.level === 1, 'new game should reset the level');
    assert(model.progress.gameTime === START_TIME, 'new game should return to the morning start time');
    assert(model.progress.unlockedFloors === 5, 'new game should reset to the first level floor set');
    assert(model.economy.coins === 20, 'new game should reset coins');
    assert(model.economy.stars === 0, 'new game should reset stars');
    assert(model.economy.bestScore === 0, 'new game should reset best score');
    assert(model.upgrades.speedLevel === 0, 'new game should clear upgrades');
    assert(!model.progress.started, 'new game should wait for the start button');
}

function testRestoreReturnsToCleanLevelStart(): void {
    const model = createRunningModel('1-2');
    model.createPassenger(0, 2);
    model.update(5);
    const snapshot = model.snapshot();

    const restored = new GameModel();
    restored.restore(snapshot);

    assert(!restored.progress.started, 'restored preview sessions should wait for the start button');
    assert(restored.passengers.length === 0, 'restoring should clear transient run passengers');
    assert(restored.progress.gameTime === START_TIME, 'restoring should reset the run clock to the level start');
    assert(restored.elevator.currentFloor === 0, 'restoring should return the elevator to the lobby');
}

function testFloorExtensionHasNoArtificialSixFloorCap(): void {
    const model = createRunningModel();
    model.progress.unlockedFloors = 6;
    model.economy.coins = 1000;

    assert(model.extendFloor(), 'floor extension should continue beyond six floors');
    assert(model.progress.unlockedFloors === 7, 'a seventh floor should be added');
}

function testSecondElevatorTakesOverflowWhenBothCabinsShareFloor(): void {
    const model = createRunningModel('2-1');
    model.elevators[0].capacity = 5;
    model.elevators[1].capacity = 5;
    for (let i = 0; i < 10; i += 1) {
        model.createPassenger(0, 2);
    }

    assert(model.boardAtElevator(0) === 10, 'both elevators should reserve the whole queue when both are open on the same floor');
    for (let i = 0; i < 5; i += 1) {
        model.update(0.25);
    }
    assert(model.elevators[0].passengers.length === 5, 'the first elevator should contain five passengers');
    assert(model.elevators[1].passengers.length === 5, 'the second elevator should contain five passengers');
    assert(model.getFloorQueue(0).length === 0, 'no passenger should remain waiting after both cabins board');
}

function testFloorCommandsStayOnExplicitElevator(): void {
    const model = createRunningModel('2-1');
    model.progress.unlockedFloors = 5;

    assert(model.queueFloorForElevator(4, 1), 'S2 should accept an explicit floor command');
    assert(model.elevators[0].targetFloor === null, 'S1 must not receive commands intended for S2');
    assert(model.elevators[1].targetFloor === 4, 'S2 should move to the clicked floor');
}

function testExplicitElevatorQueueSurvivesControlSwitch(): void {
    const model = createRunningModel('2-1');
    model.progress.unlockedFloors = 6;

    assert(model.queueFloorForElevator(2, 0), 'S1 should start toward floor 2');
    assert(model.queueFloorForElevator(4, 0), 'S1 should append floor 4 while moving');
    assert(model.queueFloorForElevator(5, 0), 'S1 should append floor 5 while moving');
    assert(model.queueFloorForElevator(3, 0), 'S1 should append floor 3 while moving');
    assert(model.queueFloorForElevator(1, 1), 'S2 should accept its own command after control switches');

    assert(model.elevators[0].targetFloor === 2, 'S1 active target should stay at the first clicked floor');
    assert(model.elevators[0].queue.join(',') === '4,5,3', 'S1 pending stops must preserve 4,5,3');
    assert(model.elevators[1].targetFloor === 1, 'S2 should move independently');

    const s1Arrivals: number[] = [];
    let previousS1Floor = model.elevators[0].currentFloor;
    for (let elapsed = 0; elapsed < 20; elapsed += 0.05) {
        model.update(0.05);
        if (model.elevators[0].currentFloor !== previousS1Floor) {
            previousS1Floor = model.elevators[0].currentFloor;
            s1Arrivals.push(previousS1Floor);
        }
        if (model.elevators[0].targetFloor === null && model.elevators[0].queue.length === 0) {
            break;
        }
    }

    assert(s1Arrivals.join(',') === '2,4,5,3', 'S1 should continue 2,4,5,3 after S2 is controlled');
}

function testDeliveryAddsQualityScore(): void {
    const model = createRunningModel('1-3');
    const passenger = model.createPassenger(0, 1);
    passenger.patience = passenger.maxPatience;
    passenger.state = PassengerState.Riding;
    passenger.boardFloor = 0;
    passenger.boardGameTime = model.progress.gameTime;
    passenger.actualRideDistance = 0;
    passenger.intermediateStops = 0;
    passenger.lastElevatorFloor = 0;
    model.elevator.passengers = [passenger.id];

    model.queueFloor(1);
    runUntilIdle(model);
    model.update(0.29);
    const deliveredEvents = model.drainDeliveredEvents();

    assert(model.economy.delivered === 1, 'delivery should count toward the run');
    assert(model.economy.score >= 95, 'a direct high-patience ride should score near the base quality score');
    assert(model.economy.bestScore === model.economy.score, 'best score should track the highest run score');
    assert(deliveredEvents[0].scoreGain === model.economy.score, 'delivery event should expose the quality score gain');
    assert(deliveredEvents[0].qualityLabel === 'Perfect', 'a clean ride should show a Perfect rating');
}

function testIntermediateStopLowersQualityScore(): void {
    const model = createRunningModel('1-3');
    const passenger = model.createPassenger(0, 2);
    passenger.patience = passenger.maxPatience;
    passenger.state = PassengerState.Riding;
    passenger.boardFloor = 0;
    passenger.boardGameTime = model.progress.gameTime;
    passenger.actualRideDistance = 0;
    passenger.intermediateStops = 0;
    passenger.lastElevatorFloor = 0;
    model.elevator.passengers = [passenger.id];

    model.queueFloor(1);
    model.queueFloor(2);
    for (let elapsed = 0; elapsed < 20; elapsed += 0.05) {
        model.update(0.05);
        if (model.economy.delivered === 1) {
            break;
        }
    }
    const deliveredEvents = model.drainDeliveredEvents();

    assert(passenger.actualRideDistance === 2, 'two-floor direct travel should accumulate two ride distance');
    assert(passenger.intermediateStops === 1, 'stopping at floor 1 should count as one intermediate stop');
    assert(deliveredEvents[0].scoreGain < 100, 'intermediate stops should lower the quality score');
    assert(deliveredEvents[0].qualityLabel === 'Good', 'one efficient intermediate stop should still be rated Good');
}

function testRidePatienceDecaysSlowerInsideElevator(): void {
    const model = createRunningModel('1-3');
    const passenger = model.createPassenger(0, 2);
    passenger.state = PassengerState.Riding;
    passenger.boardFloor = 0;
    passenger.boardGameTime = model.progress.gameTime;
    passenger.lastElevatorFloor = 0;
    model.elevator.passengers = [passenger.id];

    model.update(10);

    assert(passenger.waitElapsed === 5, 'riding without stops should decay patience at half speed');
    assert(passenger.patience === 35, 'riding passenger should retain more patience than waiting passengers');
}

function testStopsAndDetoursIncreaseRidePatienceDecay(): void {
    const model = createRunningModel('1-3');
    const passenger = model.createPassenger(0, 2);
    passenger.state = PassengerState.Riding;
    passenger.boardFloor = 0;
    passenger.boardGameTime = model.progress.gameTime;
    passenger.lastElevatorFloor = 0;
    passenger.intermediateStops = 2;
    passenger.frustration = 2;
    passenger.actualRideDistance = 5;
    model.elevator.passengers = [passenger.id];

    model.update(10);

    assert(
        Math.abs(passenger.waitElapsed - 9.5) < 0.001,
        'two stops plus three extra detour floors should decay at 0.95x speed',
    );
    assert(Math.abs(passenger.patience - 30.5) < 0.001, 'detour frustration should reduce remaining patience');
}

function testPassengerDestinationColorStaysStableWhileBoarding(): void {
    const model = createRunningModel('1-3');
    const passenger = model.createPassenger(0, 4);
    const colorIndex = passenger.destinationColorIndex;

    assert(colorIndex === model.getFloorColorIndex(4), 'passenger should cache the destination floor color index');
    assert(model.boardAtCurrentFloor() === 1, 'the passenger should start boarding');
    model.update(0.23);

    assert(passenger.state === PassengerState.Riding, 'the passenger should enter the cabin');
    assert(
        passenger.destinationColorIndex === colorIndex,
        'boarding into the elevator must not change the passenger destination color',
    );
}

function testFloorTypesAndRushWarnings(): void {
    const model = new GameModel();

    assert(model.getFloorType(0) === 'ground', 'G should be the ground lobby');
    assert(model.getFloorType(1) === 'office', 'chapter one floors should default to office');
    assert(model.activeElevatorCount === 1, 'the first level should expose only one elevator');
    assert(model.progress.gameTime === START_TIME, 'the game clock should start at 06:00');

    const warnings = model.getUpcomingRushEvents(2);
    assert(warnings.length === 0, 'chapter one should not show rush warnings yet');

    model.loadLevel('2-1');
    assert(model.activeElevatorCount === 2, 'level 2-1 should enable the second elevator');
}

function testRushEventGeneratesTypedPassengerRequests(): void {
    const model = createRunningModel();

    model.update(1.9);
    assert(model.drainTrafficSpawnRequests().length === 0, 'ambient traffic should wait for the configured first delay');
    model.update(0.2);
    const requests = model.drainTrafficSpawnRequests();

    assert(requests.length >= 1, 'chapter one should create gentle ambient passenger requests');
    assert(requests.every((request) => request.originFloor !== request.destinationFloor), 'ambient passengers need a real destination');
}

function testDifficultyScalesTrafficByLevelAndFloorCount(): void {
    const early = createRunningModel();
    assert(early.currentTimeScale === 1.5, 'level 1-2 should use the second beginner time scale');
    assert(early.currentWaitingPassengerLimit === 14, 'level 1-2 should use its own queue cap');

    const later = createRunningModel('2-1');
    assert(later.currentTimeScale === 2.5, 'the hidden 2-1 config should use the next difficulty band');
    assert(later.currentWaitingPassengerLimit === 20, 'level 2-1 should raise the queue cap');

    assert(later.activeElevatorCount === 2, 'level 2-1 should be ready for dual-elevator tuning');
}

function testAmbientAndSmallQueueUseRealTimeAndAnyFloor(): void {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
        const model = createRunningModel();
        model.update(1.9);
        assert(model.drainTrafficSpawnRequests().length === 0, 'ambient traffic should wait for its first short delay');

        model.update(0.2);
        const ambientRequests = model.drainTrafficSpawnRequests();

        assert(model.currentWaitingPassengerLimit === 14, 'level 1-2 waiting queue should use its configured cap');
        assert(ambientRequests.length === 1, 'ambient traffic should spawn one passenger early');
        assert(ambientRequests[0].originFloor === 0, 'ambient traffic can start from any unlocked floor');
        assert(ambientRequests[0].destinationFloor === 1, 'ambient traffic can target any different unlocked floor');

        model.update(40);
        const smallQueueRequests = model.drainTrafficSpawnRequests();
        assert(smallQueueRequests.length >= 2, 'small queues should appear on the opening rhythm');
    } finally {
        Math.random = originalRandom;
    }
}

function testTransferLevelUsesSkyLobbyLegsAndServiceRanges(): void {
    const model = createRunningModel('4-1');
    const passenger = model.createPassenger(0, 5);

    assert(model.activeElevatorCount === 2, 'transfer level should enable two elevators');
    assert(model.getRenderableFloors().join(',') === '0,1,2,3,4,5', 'level mode should render at most six floors');
    assert(passenger.destinationFloor === 3, 'high-floor passengers should first travel to the sky lobby');
    assert(passenger.finalDestinationFloor === 5, 'passenger should retain the final destination');
    assert(passenger.transferFloor === 3, 'the third floor should be remembered as the transfer floor');
    assert(model.elevators[1].currentFloor === 3, 'S2 should start at its lowest service floor');
    assert(model.elevators[1].position === 3, 'S2 should be visually parked on the third floor');
    assert(!model.queueFloorForElevator(5, 0), 'low-zone elevator must reject high floors');
    assert(!model.queueFloorForElevator(0, 1), 'high-zone elevator must reject low floors below the sky lobby');

    assert(model.boardAtElevator(0) === 1, 'S1 should board the passenger for the low-zone leg');
    model.update(0.25);
    assert(model.queueFloorForElevator(3, 0), 'S1 should accept the sky lobby stop');
    for (let elapsed = 0; elapsed < 20; elapsed += 0.05) {
        model.update(0.05);
        if (passenger.state === PassengerState.Riding && model.elevators[1].passengers.includes(passenger.id)) {
            break;
        }
    }

    assert(model.economy.delivered === 0, 'reaching the sky lobby should not count as final delivery');
    assert(passenger.state === PassengerState.Riding, 'passenger should directly transfer into S2 when it is waiting at the sky lobby');
    assert(model.elevators[1].passengers.includes(passenger.id), 'S2 should receive the transferred passenger without an extra tap');
    assert(passenger.originFloor === 3, 'passenger should restart the ride from the sky lobby after direct transfer');
    assert(passenger.destinationFloor === 5, 'passenger should now target the final high floor');
    assert(passenger.transferFloor === undefined, 'transfer marker should clear after the first leg');

    assert(model.elevators[1].currentFloor === 3, 'S2 should already wait at the sky lobby');
    assert(model.queueFloorForElevator(5, 1), 'S2 should accept the final high-floor stop');
    for (let elapsed = 0; elapsed < 20; elapsed += 0.05) {
        model.update(0.05);
        if (passenger.state === PassengerState.Delivered) {
            break;
        }
    }

    assert(passenger.state === PassengerState.Delivered, 'passenger should finish after the high-zone leg');
    assert(model.economy.delivered === 1, 'final high-floor arrival should count as one delivery');
}

function testTransferFallsBackToWaitingWhenHighElevatorIsFull(): void {
    const model = createRunningModel('4-1');
    const passenger = model.createPassenger(0, 5);
    for (let index = 0; index < model.elevators[1].capacity; index += 1) {
        const filler = model.createPassenger(3, 5);
        filler.state = PassengerState.Riding;
        model.elevators[1].passengers.push(filler.id);
    }

    assert(model.boardAtElevator(0) === 1, 'S1 should board the transfer passenger');
    model.update(0.25);
    assert(model.queueFloorForElevator(3, 0), 'S1 should move to the sky lobby');
    for (let elapsed = 0; elapsed < 20; elapsed += 0.05) {
        model.update(0.05);
        if (passenger.state === PassengerState.Waiting && passenger.originFloor === 3) {
            break;
        }
    }

    assert(passenger.state === PassengerState.Waiting, 'passenger should wait at the sky lobby if S2 has no room');
    assert(passenger.destinationFloor === 5, 'fallback waiting passenger should keep the final destination');
    assert(!model.elevators[1].passengers.includes(passenger.id), 'full S2 must not overfill during direct transfer');
}

function testLevelModeNeverExposesMoreThanSixFloors(): void {
    const model = new GameModel();
    model.levelConfigs.forEach((level) => {
        model.loadLevel(level.id);
        const renderableFloors = model.getRenderableFloors();
        assert(renderableFloors.length <= 6, `${level.id} should fit inside the six-floor level viewport`);
        assert(Math.max(...renderableFloors) <= 5, `${level.id} should not expose floors above 5F`);
    });
}

testRunWaitsForExplicitStart();
testManualBoardingIgnoresDirection();
testBoardingPassengersRemainInVisibleLineUntilTheyEnter();
testPassengerWaitTimingMatchesFortySecondRule();
testCallingPassengerFloorDoesNotAutoBoardWithoutOnwardStop();
testAutomaticBoardingMatchesOnwardDirection();
testAutomaticBoardingAfterUnloadingMatchesArrivalDirection();
testCapacityKeepsRemainingPassengersInFifoQueue();
testPassengerPatienceRestartsInsideElevator();
testAutomaticBoardingCannotSkipQueueHead();
testCallQueueRemainsFifo();
testRepeatedFloorCommandsRunInExactClickOrder();
testFloorRequestStartsAfterBoardingCompletes();
testCurrentFloorRequestDoesNotPretendToMove();
testElevatorCanTravelToSecondAndThirdFloors();
testPassengersLeaveOneAtATimeWithSeparateEvents();
testPatienceWarningAndFailureRule();
testRestartClearsFailedRun();
testStartNewGameResetsProgressAndEconomy();
testRestoreReturnsToCleanLevelStart();
testFloorExtensionHasNoArtificialSixFloorCap();
testSecondElevatorTakesOverflowWhenBothCabinsShareFloor();
testFloorCommandsStayOnExplicitElevator();
testExplicitElevatorQueueSurvivesControlSwitch();
testDeliveryAddsQualityScore();
testIntermediateStopLowersQualityScore();
testRidePatienceDecaysSlowerInsideElevator();
testStopsAndDetoursIncreaseRidePatienceDecay();
testPassengerDestinationColorStaysStableWhileBoarding();
testFloorTypesAndRushWarnings();
testRushEventGeneratesTypedPassengerRequests();
testDifficultyScalesTrafficByLevelAndFloorCount();
testAmbientAndSmallQueueUseRealTimeAndAnyFloor();
testTransferLevelUsesSkyLobbyLegsAndServiceRanges();
testTransferFallsBackToWaitingWhenHighElevatorIsFull();
testLevelModeNeverExposesMoreThanSixFloors();
console.log('MODEL_DIRECTION_RULES_OK');
