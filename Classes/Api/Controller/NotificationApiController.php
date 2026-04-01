<?php

declare(strict_types=1);

namespace UpAssist\Neos\EditorNotifications\Api\Controller;

use Neos\Flow\Annotations as Flow;
use Neos\Flow\Mvc\Controller\ActionController;
use Neos\Flow\Mvc\View\JsonView;
use Neos\Flow\ResourceManagement\ResourceManager;
use UpAssist\Neos\EditorNotifications\Domain\Model\Notification;
use UpAssist\Neos\EditorNotifications\Domain\Repository\NotificationRepository;
use UpAssist\Neos\EditorNotifications\Service\NotificationService;

class NotificationApiController extends ActionController
{
    protected $defaultViewObjectName = JsonView::class;

    /**
     * @var array<string, class-string>
     */
    protected $viewFormatToObjectNameMap = [
        'json' => JsonView::class,
    ];

    /**
     * @Flow\Inject
     * @var NotificationService
     */
    protected $notificationService;

    /**
     * @Flow\Inject
     * @var NotificationRepository
     */
    protected $notificationRepository;

    /**
     * @Flow\Inject
     * @var ResourceManager
     */
    protected $resourceManager;

    public function unreadCountAction(): void
    {
        $data = $this->notificationService->getActiveNotificationsForCurrentUser();
        $this->view->assign('value', ['count' => $data['count']]);
    }

    public function activeAction(bool $includeDismissed = false): void
    {
        $data = $this->notificationService->getActiveNotificationsForCurrentUser($includeDismissed);
        $this->view->assign('value', $data);
    }

    public function markSeenAction(string $notificationIdentifier): void
    {
        $notification = $this->findActiveNotification($notificationIdentifier);
        if ($notification !== null) {
            $this->notificationService->markSeen($notification);
        }

        $this->view->assign('value', ['success' => $notification !== null]);
    }

    public function markUnseenAction(string $notificationIdentifier): void
    {
        $notification = $this->findActiveNotification($notificationIdentifier);
        if ($notification !== null) {
            $this->notificationService->markUnseen($notification);
        }

        $this->view->assign('value', ['success' => $notification !== null]);
    }

    public function dismissAction(string $notificationIdentifier): void
    {
        $notification = $this->findActiveNotification($notificationIdentifier);
        if ($notification !== null) {
            $this->notificationService->dismiss($notification);
        }

        $this->view->assign('value', ['success' => $notification !== null]);
    }

    private const ALLOWED_MIME_TYPES = [
        'image/jpeg' => '.jpg',
        'image/png' => '.png',
        'image/gif' => '.gif',
        'image/webp' => '.webp',
    ];

    public function uploadImageAction(): void
    {
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            $this->view->assign('value', ['success' => false, 'error' => 'No file uploaded']);
            return;
        }

        if ($_FILES['file']['size'] > 10 * 1024 * 1024) {
            $this->view->assign('value', ['success' => false, 'error' => 'File too large (max 10 MB)']);
            return;
        }

        $tmpPath = $_FILES['file']['tmp_name'];
        $detectedType = (new \finfo(FILEINFO_MIME_TYPE))->file($tmpPath);
        if ($detectedType === false || !isset(self::ALLOWED_MIME_TYPES[$detectedType])) {
            $this->view->assign('value', ['success' => false, 'error' => 'Only JPEG, PNG, GIF and WebP images are allowed']);
            return;
        }

        $content = file_get_contents($tmpPath);
        if ($content === false) {
            $this->view->assign('value', ['success' => false, 'error' => 'Failed to read uploaded file']);
            return;
        }

        $safeFilename = bin2hex(random_bytes(8)) . self::ALLOWED_MIME_TYPES[$detectedType];
        $resource = $this->resourceManager->importResourceFromContent($content, $safeFilename);

        $uri = $this->resourceManager->getPublicPersistentResourceUri($resource);
        $this->view->assign('value', ['success' => true, 'url' => (string)$uri]);
    }

    private function findActiveNotification(string $identifier): ?Notification
    {
        $notification = $this->notificationRepository->findByIdentifier($identifier);
        if (!$notification instanceof Notification || !$notification->isActive(new \DateTime())) {
            return null;
        }

        return $notification;
    }
}
