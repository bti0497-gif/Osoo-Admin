import React from 'react';
import { createPortal } from 'react-dom';

export default function PdfParserModal({ isOpen, onClose }) {
  console.log('[PdfParserModal] isOpen:', isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        minWidth: '300px',
      }}>
        <h2>성적서 PDF 파싱</h2>
        <p>모달이 열렸습니다.</p>
        <button onClick={onClose}>닫기</button>
      </div>
    </div>,
    document.body
  );
}
