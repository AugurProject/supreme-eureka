import { useReducer } from "react";
import { BETSLIP_ACTIONS, DEFAULT_BETSLIP_STATE, BETSLIP_STATE_KEYS } from "./constants";
import { BETSLIP, ACTIVE_BETS } from "../constants";
import { windowRef, Stores } from "@augurproject/comps";
const {
  Utils: { dispatchMiddleware },
} = Stores;
const { TOGGLE_SELECTED_VIEW, ADD_BET, REMOVE_BET, UPDATE_BET, UPDATE_ACTIVE } = BETSLIP_ACTIONS;
const { SELECTED_VIEW, BETS, ACTIVE } = BETSLIP_STATE_KEYS;

export function BetslipReducer(state, action) {
  const updatedState = { ...state };
  switch (action.type) {
    case TOGGLE_SELECTED_VIEW: {
      updatedState[SELECTED_VIEW] = state.selectedView === BETSLIP ? ACTIVE_BETS : BETSLIP;
      break;
    }
    case ADD_BET: {
      updatedState[BETS] = updatedState[BETS].concat(action.bet);
      break;
    }
    case REMOVE_BET: {
      delete updatedState[BETS][action.betId];
      break;
    }
    case UPDATE_BET: {
      updatedState[BETS][action.bet.betId] = {
        ...updatedState[BETS][action.bet.betId],
        ...action.bet,
      };
      break;
    }
    case UPDATE_ACTIVE: {
      updatedState[ACTIVE] = action.active;
      break;
    }
    default:
      console.log(`Error: ${action.type} not caught by App Status reducer`);
  }
  windowRef.betslip = updatedState;

  return updatedState;
}

export const useBetslip = (defaultState = DEFAULT_BETSLIP_STATE) => {
  const [state, pureDispatch] = useReducer(BetslipReducer, defaultState);
  const dispatch = dispatchMiddleware(pureDispatch);
  windowRef.betslip = state;
  return {
    ...state,
    actions: {
      toggleSelectedView: () => dispatch({ type: TOGGLE_SELECTED_VIEW }),
      addBet: (bet) => dispatch({ type: ADD_BET, bet }),
      removeBet: (betId) => dispatch({ type: REMOVE_BET, betId }),
      updateBet: (bet) => dispatch({ type: UPDATE_BET, bet }),
      updateActive: (active) => dispatch({ type: UPDATE_ACTIVE, active }),
    },
  };
};