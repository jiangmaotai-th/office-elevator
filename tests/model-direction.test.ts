import { GameModel } from '../assets/scripts/models/GameModel';
import { ElevatorDirection, PassengerState } from '../assets/scripts/models/GameTypes';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
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

function testManualBoardingIgnoresDirection(): void {
    const model = new GameModel();
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

function testAutomaticBoardingMatchesArrivalDirection(): void {
    const model = new GameModel();
    const sameDirection = model.createPassenger(1, 2);
    const oppositeDirection = model.createPassenger(1, 0);

    model.queueFloor(1);
    assert(model.elevator.direction === ElevatorDirection.Up, 'elevator should travel upward');
    runUntilIdle(model);

    assert(sameDirection.state === PassengerState.Boarding, 'up passenger should start boarding automatically');
    assert(oppositeDirection.state === PassengerState.Waiting, 'down passenger must wait for a down-going cabin');
    assert(model.elevator.currentFloor === 1, 'automatic boarding should leave the elevator at the arrival floor');
    assert(model.elevator.targetFloor === null, 'automatic boarding must wait for the next player floor click');
    assert(model.elevator.queue.length === 0, 'automatic boarding must not enqueue passenger destinations');
}

function testCapacityKeepsRemainingPassengersInFifoQueue(): void {
    const model = new GameModel();
    model.elevator.capacity = 2;
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

function testAutomaticBoardingCannotSkipQueueHead(): void {
    const model = new GameModel();
    const oppositeDirection = model.createPassenger(1, 0);
    const sameDirection = model.createPassenger(1, 2);

    model.queueFloor(1);
    runUntilIdle(model);

    assert(oppositeDirection.state === PassengerState.Waiting, 'an incompatible queue head should keep waiting');
    assert(sameDirection.state === PassengerState.Waiting, 'a later passenger cannot overtake the queue head');
    assert(model.elevatorOccupancy === 0, 'nobody should board when the queue head blocks automatic boarding');
}

function testCallQueueRemainsFifo(): void {
    const model = new GameModel();
    model.queueFloor(2);
    model.queueFloor(1);

    assert(model.elevator.targetFloor === 2, 'first floor call should remain the active target');
    assert(model.elevator.queue[0] === 1, 'later floor calls should remain FIFO');
}

function testFloorRequestStartsAfterBoardingCompletes(): void {
    const model = new GameModel();
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
    const model = new GameModel();

    const queued = model.queueFloor(0);

    assert(!queued, 'requesting the current floor should not create a fake trip');
    assert(model.elevator.targetFloor === null, 'the elevator should remain idle at the current floor');
}

function testElevatorCanTravelToSecondAndThirdFloors(): void {
    const model = new GameModel();
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
    const model = new GameModel();
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
    const model = new GameModel();
    const passenger = model.createPassenger(0, 2);
    passenger.maxPatience = 4;
    passenger.patience = 1.1;

    model.update(0.15);
    assert(model.warningFloors.includes(0), 'the passenger floor should warn during the final quarter');
    model.update(0.65);
    const warningEvents = model.drainWarningEvents();
    assert(warningEvents.length === 1, 'a warning floor should emit one rhythmic warning event');
    assert(warningEvents[0].floor === 0, 'the warning event should identify the passenger floor');

    model.queueFloor(2);
    const positionBeforeFailure = model.elevator.position;
    model.update(0.31);
    assert(model.progress.failed, 'one timed-out passenger should fail the current game');
    assert(passenger.state === PassengerState.Lost, 'the timed-out passenger should leave the queue');
    model.update(1);
    assert(model.elevator.position === positionBeforeFailure, 'the simulation should freeze after failure');
}

testManualBoardingIgnoresDirection();
testAutomaticBoardingMatchesArrivalDirection();
testCapacityKeepsRemainingPassengersInFifoQueue();
testAutomaticBoardingCannotSkipQueueHead();
testCallQueueRemainsFifo();
testFloorRequestStartsAfterBoardingCompletes();
testCurrentFloorRequestDoesNotPretendToMove();
testElevatorCanTravelToSecondAndThirdFloors();
testPassengersLeaveOneAtATimeWithSeparateEvents();
testPatienceWarningAndFailureRule();
console.log('MODEL_DIRECTION_RULES_OK');
