import React, { ReactElement } from 'react';
import { Modal } from 'react-bootstrap';

type PropsType = {
  title: string,
}

const Header = ({
  title,
}: PropsType): ReactElement => (
  <Modal.Header>
    <h4 id="modalTitle" className="modal-title">{title}</h4>
  </Modal.Header>
);

export default Header;
