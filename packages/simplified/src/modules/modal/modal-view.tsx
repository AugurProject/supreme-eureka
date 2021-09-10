import React, { useEffect, useState, useRef } from "react";
import ModalAddLiquidity from "./modal-add-liquidity";
import { useHistory } from "react-router";
import Styles from "./modal.styles.less";
import { MODAL_ADD_LIQUIDITY, MODAL_CONNECT_TO_POLYGON } from "../constants";
import { Constants, Modals, useUserStore, useAppStatusStore } from "@augurproject/comps";

const { ModalConnectWallet } = Modals;

function selectModal(type, modal, logout, closeModal, removeTransaction, isLogged, isMobile) {
  switch (type) {
    case MODAL_ADD_LIQUIDITY:
      return <ModalAddLiquidity {...modal} />;
    case Constants.MODAL_CONNECT_WALLET:
      return (
        <ModalConnectWallet
          {...modal}
          logout={logout}
          closeModal={closeModal}
          isLogged={isLogged}
          isMobile={isMobile}
          removeTransaction={removeTransaction}
        />
      );
    case MODAL_CONNECT_TO_POLYGON:
      return (
        <section className={Styles.ModalView}>
          <div className={Styles.FooterText}>
            Unable to connect to Polygon.{" "}
            <a
              href="https://docs.matic.network/docs/develop/metamask/config-matic"
              target="_blank"
              rel="noopener noreferrer"
            >
              Please change your network provider to Polygon.
            </a>
          </div>
        </section>
      );
    default:
      return <div />;
  }
}

const ESCAPE_KEYCODE = 27;

const ModalView = () => {
  const history = useHistory();
  const modalRef = useRef(null);
  const {
    modal,
    isLogged,
    isMobile,
    actions: { closeModal },
  } = useAppStatusStore();
  const {
    actions: { logout, removeTransaction },
  } = useUserStore();
  const [locationKeys, setLocationKeys]: [any[], Function] = useState([]);

  const handleKeyDown = (e) => {
    if (e.keyCode === ESCAPE_KEYCODE) {
      if (modal && modal.cb) {
        modal.cb();
      }
      closeModal();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return history.listen((location) => {
      if (history.action === "PUSH") {
        setLocationKeys([location.key]);
      }

      if (history.action === "POP") {
        if (locationKeys[1] === location.key) {
          setLocationKeys(([_, ...keys]) => keys);

          closeModal();
        } else {
          setLocationKeys((keys) => [location.key, ...keys]);

          closeModal();
        }
      }
    });
  }, [locationKeys]);

  const Modal = selectModal(modal.type, modal, logout, closeModal, removeTransaction, isLogged, isMobile);

  return (
    <section className={Styles.ModalView}>
      <div ref={modalRef}>{Modal}</div>
    </section>
  );
};

export default ModalView;
