import debugModule from "debug";
const debug = debugModule("debugger:trace:sagas");

import { take, takeEvery, put, select } from "redux-saga/effects";
import { prefixName, isCallMnemonic } from "lib/helpers";

import * as Codec from "@truffle/codec";

import * as actions from "../actions";

import trace from "../selectors";

export function* setSubmoduleCount(count) {
  yield put(actions.setSubmoduleCount(count));
}

export function* addSubmoduleToCount() {
  let count = yield select(trace.application.submoduleCount);
  yield put(actions.setSubmoduleCount(count + 1));
}

export function* advance() {
  yield put(actions.next());

  debug("TOCK to take");
  yield take([actions.TOCK, actions.END_OF_TRACE]);
  debug("TOCK taken");
}

function* next() {
  let remaining = yield select(trace.stepsRemaining);
  debug("remaining: %o", remaining);
  let steps = yield select(trace.steps);
  debug("total steps: %o", steps.length);
  let waitingForSubmodules = 0;

  if (remaining > 0) {
    debug("putting TICK");
    // updates state for current step
    waitingForSubmodules = yield select(trace.application.submoduleCount);
    yield put(actions.tick());
    debug("put TICK");

    //wait for all backticks before continuing
    while (waitingForSubmodules > 0) {
      yield take(actions.BACKTICK);
      debug("got BACKTICK");
      waitingForSubmodules--;
    }

    remaining--; // local update, just for convenience
  }

  if (remaining) {
    debug("putting TOCK");
    // updates step to next step in trace
    yield put(actions.tock());
    debug("put TOCK");
  } else {
    debug("putting END_OF_TRACE");
    yield put(actions.endTrace());
    debug("put END_OF_TRACE");
  }
}

export function* signalTickSagaCompletion() {
  yield put(actions.backtick());
}

export function* processTrace(steps) {
  yield put(actions.saveSteps(steps));

  let addresses = [
    ...new Set(
      steps
        .map(({ op, stack }) =>
          isCallMnemonic(op)
            ? //if it's a call, just fetch the address off the stack
              Codec.Evm.Utils.toAddress(stack[stack.length - 2])
            : //if it's not a call, just return undefined (we've gone back to
              //skipping creates)
              undefined
        )
        //filter out zero addresses from failed creates (as well as undefineds)
        .filter(
          (address) =>
            address !== undefined && address !== Codec.Evm.Utils.ZERO_ADDRESS
        )
    ),
  ];

  return addresses;
}

export function* reset() {
  yield put(actions.reset());
}

export function* unload() {
  yield put(actions.unloadTransaction());
}

export function* saga() {
  yield takeEvery(actions.NEXT, next);
}

export default prefixName("trace", saga);
