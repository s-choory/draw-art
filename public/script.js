const socket = new WebSocket('ws://localhost:8080');
const drawCanvas = document.getElementById('drawCanvas');
const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });
const viewCanvas = document.getElementById('viewCanvas');
const viewCtx = viewCanvas.getContext('2d', { willReadFrequently: true });
const colorPicker = document.getElementById('colorPicker');
const penSize = document.getElementById('penSize');
let drawing = false;
let currentColor = colorPicker.value;
let currentPenSize = penSize.value;
let erasing = false;
const shapes = [];
const undoStack = [];
const redoStack = [];
// WebSocket 이벤트 처리
socket.onopen = () => console.log('WebSocket 연결 열림');
socket.onclose = () => console.log('WebSocket 연결 닫힘');
socket.onerror = (error) => console.log('WebSocket 오류:', error);
socket.onmessage = async (event) => {
    try {
        const json = JSON.parse(await event.data.text());
        console.log('WebSocket 메시지 수신:', json);
        const img = new Image();
        img.src = json.src;
        img.onload = () => {
            const shape = new Shape(img, json.x, json.y, json.width, json.height, json.vx, json.vy);
            shapes.push(shape);
            setTimeout(() => {
                const index = shapes.indexOf(shape);
                if (index > -1) shapes.splice(index, 1);
            }, 30000);
        };
    } catch (error) {
        console.error('WebSocket 메시지 파싱 오류:', error);
    }
};

// viewCanvas를 전체 화면 크기로 설정
function resizeCanvas() {
    viewCanvas.width = window.innerWidth;
    viewCanvas.height = window.innerHeight;
}

// 초기 설정 및 창 크기 변경 시 캔버스 크기 조정
window.addEventListener('load', resizeCanvas);
window.addEventListener('resize', resizeCanvas);


class Shape {
    constructor(img, x, y, width, height, vx, vy) {
        this.img = img;
        this.x = x;
        this.y = y;
        this.width = width / 2; // 이미지를 3분의 1 크기로 줄이기
        this.height = height / 2; // 이미지를 3분의 1 크기로 줄이기
        this.vx = vx;
        this.vy = vy;
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.1;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.drawImage(this.img, -this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;

        const corners = this.getRotatedCorners();
        const bounds = this.getBoundingBox(corners);

        // 전체 화면 크기를 사용하여 충돌 검사
        if (bounds.left < 0) {
            this.x -= bounds.left;
            this.vx = Math.abs(this.vx);
        } else if (bounds.right > window.innerWidth) {
            this.x -= (bounds.right - window.innerWidth);
            this.vx = -Math.abs(this.vx);
        }

        if (bounds.top < 0) {
            this.y -= bounds.top;
            this.vy = Math.abs(this.vy);
        } else if (bounds.bottom > window.innerHeight) {
            this.y -= (bounds.bottom - window.innerHeight);
            this.vy = -Math.abs(this.vy);
        }
    }

    getRotatedCorners() {
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;

        return [
            {x: this.x + cos * halfWidth - sin * halfHeight, y: this.y + sin * halfWidth + cos * halfHeight},
            {x: this.x - cos * halfWidth - sin * halfHeight, y: this.y - sin * halfWidth + cos * halfHeight},
            {x: this.x - cos * halfWidth + sin * halfHeight, y: this.y - sin * halfWidth - cos * halfHeight},
            {x: this.x + cos * halfWidth + sin * halfHeight, y: this.y + sin * halfWidth - cos * halfHeight}
        ];
    }

    getBoundingBox(corners) {
        const xs = corners.map(c => c.x);
        const ys = corners.map(c => c.y);
        return {
            left: Math.min(...xs),
            right: Math.max(...xs),
            top: Math.min(...ys),
            bottom: Math.max(...ys)
        };
    }
}
// 이미지 삽입 함수 추가
function drawImage(src) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
        const scale = 1; // 이미지 크기 조절
        const width = img.width * scale;
        const height = img.height * scale;
        const x = (drawCanvas.width - width) / 2;
        const y = (drawCanvas.height - height) / 2;
        drawCtx.drawImage(img, x, y, width, height);
        undoStack.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    };
}

// 기존의 다른 함수와 이벤트 리스너
colorPicker.addEventListener('input', (event) => {
    currentColor = event.target.value;
    drawCtx.strokeStyle = currentColor;
    drawCtx.fillStyle = currentColor;
    if (!erasing) drawCtx.lineWidth = currentPenSize;
});

penSize.addEventListener('input', (event) => {
    currentPenSize = event.target.value;
    if (!erasing) drawCtx.lineWidth = currentPenSize;
});

// 초기 펜 크기 설정
drawCtx.lineWidth = penSize.value;

drawCanvas.addEventListener('mousedown', startDrawing);
drawCanvas.addEventListener('mousemove', draw);
drawCanvas.addEventListener('mouseup', stopDrawing);
drawCanvas.addEventListener('mouseout', stopDrawing);

drawCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrawing(e.touches[0]);
});

drawCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e.touches[0]);
});
drawCanvas.addEventListener('touchend', stopDrawing);

function getMousePos(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function startDrawing(event) {
    drawing = true;
    draw(event);
}

function draw(event) {
    if (!drawing) return;
    const pos = getMousePos(event, drawCanvas);
    const x = pos.x;
    const y = pos.y;

    if (erasing) {
        drawCtx.clearRect(x - currentPenSize, y - currentPenSize, currentPenSize * 2, currentPenSize * 2);
    } else {
        drawCtx.lineTo(x, y);
        drawCtx.stroke();
        drawCtx.beginPath();
        drawCtx.arc(x, y, drawCtx.lineWidth / 2, 0, Math.PI * 2);
        drawCtx.fill();
        drawCtx.beginPath();
        drawCtx.moveTo(x, y);
    }
}

function stopDrawing() {
    if (drawing) {
        drawing = false;
        drawCtx.beginPath();
        undoStack.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    }
}

function usePen() {
    erasing = false;
    drawCtx.strokeStyle = currentColor;
    drawCtx.lineWidth = currentPenSize;
    setActiveButton('pen');
}

function useEraser() {
    erasing = true;
    drawCtx.strokeStyle = '#FFFFFF';
    drawCtx.lineWidth = 10;
    setActiveButton('eraser');
    drawCanvas.style.cursor = 'default'; // 지우개 커서를 기본으로 설정
}

// 버튼 상태 변경 함수
function setActiveButton(tool) {
    const buttons = document.querySelectorAll('.icon-button');
    buttons.forEach(button => button.classList.remove('active'));

    if (tool === 'pen') {
        document.querySelector('.fa-pen').parentElement.classList.add('active');
    } else if (tool === 'eraser') {
        document.querySelector('.fa-eraser').parentElement.classList.add('active');
    }
}

function undo() {
    if (undoStack.length > 0) {
        const imageData = undoStack.pop();
        redoStack.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
        drawCtx.putImageData(imageData, 0, 0);
    }
}

function redo() {
    if (redoStack.length > 0) {
        const imageData = redoStack.pop();
        undoStack.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
        drawCtx.putImageData(imageData, 0, 0);
    }
}

function clearCanvas() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    undoStack.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
}

function confirmDrawing() {
    const imageData = drawCanvas.toDataURL('image/png');
    const img = new Image();
    img.src = imageData;
    img.onload = () => {
        const scale = 0.5;  // 이미지를 3분의 1 크기로 줄이기
        const { x, y, width, height } = getNonEmptyCanvasBounds(drawCtx, drawCanvas);
        const shape = new Shape(
            img,
            x + width / 2,
            y + height / 2,
            width * scale,
            height * scale,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4
        );
        shapes.push(shape);

        const message = JSON.stringify({
            src: imageData,
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
            vx: shape.vx,
            vy: shape.vy
        });
        console.log('메시지 전송:', message);
        socket.send(message);

        setTimeout(() => {
            const index = shapes.indexOf(shape);
            if (index > -1) {
                shapes.splice(index, 1);
            }
        }, 30000);
    };

    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    undoStack.length = 0; // Clear the array without reassigning
}

// Helper function to get the non-empty bounds of the canvas
function getNonEmptyCanvasBounds(ctx, canvas) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let x0 = canvas.width, y0 = canvas.height, x1 = 0, y1 = 0;
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const index = (y * canvas.width + x) * 4;
            if (pixels[index + 3] > 0) { // Check alpha value
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// 애니메이션 업데이트 함수
function update() {
    viewCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    shapes.forEach(shape => {
        shape.update();
        shape.draw(viewCtx);
    });
    requestAnimationFrame(update);
}


// 초기 설정
resizeCanvas();
update();

// 다크 모드 토글
const darkModeToggle = document.getElementById('darkModeToggle');
darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
});

// 전체 화면 토글 기능 추가
function toggleFullscreen(elementId) {
    const element = document.getElementById(elementId);
    if (!document.fullscreenElement) {
        element.classList.add('fullscreen-container'); // 전체 화면 모드 스타일 추가
        element.requestFullscreen().catch(err => {
            alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen().then(() => {
            element.classList.remove('fullscreen-container'); // 전체 화면 모드 스타일 제거
        });
    }
}